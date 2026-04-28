import { closeSync, mkdirSync, openSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { OAuthFlowError, readTokenResponse } from './oauth-flow.js';
import { buildScopeString, resolveOAuthConfig } from './oauth-config.js';
import { appendAuthAuditEvent } from './audit-log.js';
import { storeOAuthCredential, probeBackend } from './credential-store.js';
import { CredentialRefreshError, type CredentialRefreshReason, type StoredOAuthCredential } from '../types/credential.js';
import type { OAuthConfig, TokenResponse } from '../types/oauth.js';

const DEFAULT_LOCK_WAIT_MS = 5_000;
const inFlight = new Map<string, Promise<StoredOAuthCredential>>();

export function locksDir(): string {
  return join(homedir(), '.azdo', '.locks');
}

export function lockPath(org: string): string {
  // sanitise org for filename
  const safe = org.replace(/[^A-Za-z0-9_.-]/g, '_');
  return join(locksDir(), `${safe}.refresh`);
}

interface AcquiredLock {
  release: () => void;
}

export interface RefreshDeps {
  fetch?: typeof fetch;
  oauthConfigOverride?: OAuthConfig;
  /** Override the cross-process lock waiter for tests. */
  acquireLock?: (org: string) => Promise<AcquiredLock | null>;
  /** Override "now" for tests. */
  now?: () => number;
  /** Override the credential persistence path for tests. */
  persist?: (org: string, cred: StoredOAuthCredential) => Promise<void>;
}

async function defaultAcquireLock(org: string, waitMs = DEFAULT_LOCK_WAIT_MS): Promise<AcquiredLock | null> {
  const path = lockPath(org);
  mkdirSync(locksDir(), { recursive: true, mode: 0o700 });

  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      const fd = openSync(path, 'wx');
      closeSync(fd);
      return {
        release: (): void => {
          try {
            unlinkSync(path);
          } catch {
            /* best-effort */
          }
        },
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      if (Date.now() > deadline) return null;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

export function classifyRefreshFailure(error: { error?: string; error_description?: string } | string): CredentialRefreshReason {
  const code = typeof error === 'string' ? error : error.error ?? '';
  switch (code) {
    case 'invalid_grant':
      // Could be revoked / window-exceeded; without further detail, classify as invalid-grant.
      return 'invalid-grant';
    case 'AADSTS70008': // refresh_token expired
    case 'expired_token':
      return 'window-exceeded';
    case 'AADSTS50173': // Auth method change requires fresh login
    case 'consent_required':
    case 'interaction_required':
    case 'login_required':
    case 'access_denied':
      return 'revoked';
    case 'network':
      return 'network';
    default:
      return 'unknown';
  }
}

async function performRefresh(
  org: string,
  current: StoredOAuthCredential,
  oauthConfig: OAuthConfig,
  fetchFn: typeof fetch,
  now: () => number,
  persist: (org: string, cred: StoredOAuthCredential) => Promise<void>,
): Promise<StoredOAuthCredential> {
  if (!current.refreshToken) {
    throw new CredentialRefreshError(org, 'invalid-grant');
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: oauthConfig.clientId,
    refresh_token: current.refreshToken,
    scope: buildScopeString(oauthConfig.scopes),
  });
  let response: Response;
  try {
    response = await fetchFn(oauthConfig.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: body.toString(),
    });
  } catch (err) {
    appendAuthAuditEvent({
      event: 'oauth-refresh-failed',
      org,
      backend: probeBackend(),
      accountId: current.accountId,
      reason: 'network',
    });
    throw new CredentialRefreshError(org, 'network', err);
  }
  let token: TokenResponse;
  try {
    token = await readTokenResponse(response);
  } catch (err) {
    // Translate OAuthFlowError → CredentialRefreshError using the structured
    // IdP error code (e.g. 'invalid_grant', 'AADSTS70008') preserved on the
    // OAuthFlowError instance. The .message field is a formatted sentence and
    // is NOT stable for parsing.
    let reason: CredentialRefreshReason;
    if (err instanceof OAuthFlowError && err.idpErrorCode) {
      reason = classifyRefreshFailure({ error: err.idpErrorCode, error_description: err.idpErrorDescription });
    } else {
      reason = classifyRefreshFailure({ error: 'unknown' });
    }
    appendAuthAuditEvent({
      event: 'oauth-refresh-failed',
      org,
      backend: probeBackend(),
      accountId: current.accountId,
      reason,
    });
    throw new CredentialRefreshError(org, reason, err);
  }
  const issuedAt = Math.floor(now() / 1000);
  const next: StoredOAuthCredential = {
    kind: 'oauth',
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? current.refreshToken,
    expiresAt: issuedAt + token.expires_in,
    issuedAt,
    accountId: current.accountId,
    scope: token.scope ?? current.scope,
    tenantId: current.tenantId,
  };
  await persist(org, next);
  appendAuthAuditEvent({
    event: 'oauth-refresh-success',
    org,
    backend: probeBackend(),
    accountId: current.accountId,
    tokenLifetimeSec: token.expires_in,
  });
  return next;
}

/**
 * Refresh the credential if its access token is past expiry (with 60s skew
 * margin). Single-flight per org within the process; cross-process via the
 * `~/.azdo/.locks/<org>.refresh` lock file. NEVER deletes the stored
 * credential on failure (FR-014).
 */
export async function refreshIfNeeded(
  org: string,
  current: StoredOAuthCredential,
  deps: RefreshDeps = {},
): Promise<StoredOAuthCredential> {
  const now = deps.now ?? ((): number => Date.now());
  const nowSec = Math.floor(now() / 1000);
  if (current.expiresAt - nowSec > 60) {
    return current;
  }

  const inProcess = inFlight.get(org);
  if (inProcess) {
    return inProcess;
  }

  const fetchFn = deps.fetch ?? fetch;
  const oauthConfig =
    deps.oauthConfigOverride ??
    resolveOAuthConfig({
      tenantIdOverride: current.tenantId,
    });
  const acquire = deps.acquireLock ?? ((o: string): Promise<AcquiredLock | null> => defaultAcquireLock(o));
  const persist =
    deps.persist ??
    (async (o: string, c: StoredOAuthCredential): Promise<void> => {
      await storeOAuthCredential(o, c);
    });

  const op = (async (): Promise<StoredOAuthCredential> => {
    const lock = await acquire(org);
    try {
      // Re-read happens at the AuthService layer; here we just refresh under the lock.
      return await performRefresh(org, current, oauthConfig, fetchFn, now, persist);
    } finally {
      lock?.release();
    }
  })();

  inFlight.set(org, op);
  try {
    return await op;
  } finally {
    inFlight.delete(org);
  }
}

// exported for tests
export function _resetInFlight(): void {
  inFlight.clear();
}
