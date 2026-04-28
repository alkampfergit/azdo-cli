import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AuthCredential } from '../types/work-item.js';
import {
  getStoredCredential,
  storeOAuthCredential,
  deletePat as removeStored,
  listOrgsWithStoredPat,
  probeBackend,
} from './credential-store.js';
import { maskedDisplay, normalizePat } from './auth-masking.js';
import { refreshIfNeeded } from './oauth-token-refresh.js';
import { runAuthCodeFlow } from './oauth-flow.js';
import { runDeviceCodeFlow } from './oauth-device-code.js';
import { resolveOAuthConfig } from './oauth-config.js';
import { appendAuthAuditEvent } from './audit-log.js';
import {
  CredentialMissingError,
  CredentialRefreshError,
  type StoredCredential,
  type StoredOAuthCredential,
  type UsableCredential,
} from '../types/credential.js';
import type { OAuthFlow } from '../types/audit.js';

export { maskedDisplay, normalizePat };

const PAT_PROMPT = 'Enter your Azure DevOps PAT: ';

export async function promptForPat(): Promise<string | null> {
  if (!process.stdin.isTTY) {
    return null;
  }

  return new Promise<string | null>((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output: null as any,
    });

    process.stderr.write(PAT_PROMPT);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    let pat = '';

    const redraw = (): void => {
      process.stderr.write(`\r${PAT_PROMPT}${maskedDisplay(pat)}\x1B[K`);
    };

    const onData = (key: Buffer): void => {
      const ch = key.toString('utf8');

      if (ch === '\u0003') {
        process.stdin.setRawMode(false);
        process.stdin.removeListener('data', onData);
        rl.close();
        process.stderr.write('\n');
        resolve(null);
      } else if (ch === '\r' || ch === '\n') {
        process.stdin.setRawMode(false);
        process.stdin.removeListener('data', onData);
        rl.close();
        process.stderr.write('\n');
        resolve(pat);
      } else if (ch === '\u007F' || ch === '\b') {
        if (pat.length > 0) {
          pat = pat.slice(0, -1);
          redraw();
        }
      } else {
        pat += ch;
        redraw();
      }
    };

    process.stdin.on('data', onData);
  });
}

export function findDotEnvPat(startDir: string = process.cwd()): string | null {
  let current = startDir;
  while (true) {
    const envFile = join(current, '.env');
    if (existsSync(envFile)) {
      const contents = readFileSync(envFile, 'utf8');
      for (const line of contents.split('\n')) {
        const match = line.match(/^AZDO_PAT\s*=\s*(.+)$/);
        if (match) {
          const value = match[1].trim().replace(/^["']|["']$/g, '');
          if (value.length > 0) return value;
        }
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/**
 * FR-007a credential resolution. Order:
 *   1. AZDO_PAT env var → PAT credential
 *   2. Stored credential (kind-aware: PAT or OAuth + silent refresh)
 *   3. .env file walking up → PAT credential
 */
export async function resolvePat(org: string): Promise<AuthCredential | null> {
  const envPat = process.env.AZDO_PAT;
  if (envPat && envPat.length > 0) {
    return { pat: envPat, source: 'env', kind: 'pat' };
  }

  const stored = await getStoredCredential(org);
  if (stored !== null) {
    if (stored.kind === 'pat') {
      return { pat: stored.token, source: 'credential-store', kind: 'pat' };
    }
    // OAuth — refresh silently if past expiry (60s skew margin)
    const fresh = await refreshIfNeeded(org, stored);
    return {
      pat: fresh.accessToken,
      source: 'credential-store',
      kind: 'oauth',
      accountId: fresh.accountId,
    };
  }

  const dotEnvPat = findDotEnvPat();
  if (dotEnvPat !== null) {
    return { pat: dotEnvPat, source: 'env', kind: 'pat' };
  }

  return null;
}

export async function requirePat(org: string): Promise<AuthCredential> {
  const cred = await resolvePat(org);
  if (cred !== null) {
    return cred;
  }
  throw new CredentialMissingError(org);
}

export interface ValidatePatResult {
  ok: boolean;
  status: number;
}

export async function validatePatAgainstAzdo(pat: string, org: string): Promise<ValidatePatResult> {
  const url = `https://dev.azure.com/${encodeURIComponent(org)}/_apis/projects?$top=1&api-version=7.1`;
  const auth = Buffer.from(`:${pat}`).toString('base64');
  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  });
  if (response.status === 200) {
    return { ok: true, status: 200 };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: response.status };
  }
  throw new Error(`Azure DevOps returned HTTP ${response.status} while validating PAT for org "${org}".`);
}

export interface OAuthLoginOptions {
  flow?: 'auth-code' | 'device-code' | 'auto';
  clientIdOverride?: string;
  tenantIdOverride?: string;
  scopesOverride?: readonly string[];
  forceHeadless?: boolean;
}

export interface OAuthLoginResult {
  org: string;
  kind: 'oauth';
  accountId: string;
  expiresAt: number;
  scope: string;
  flowUsed: OAuthFlow;
}

/**
 * Drive the interactive OAuth login flow for the given organisation. Persists
 * the resulting credential via the kind-aware credential store. NEVER overwrites
 * an existing stored credential silently — the caller (the `azdo auth login`
 * command) must have already confirmed.
 */
export async function loginWithOAuth(org: string, opts: OAuthLoginOptions = {}): Promise<OAuthLoginResult> {
  const oauthConfig = resolveOAuthConfig({
    clientIdOverride: opts.clientIdOverride,
    tenantIdOverride: opts.tenantIdOverride,
    scopesOverride: opts.scopesOverride,
  });

  const isHeadlessRuntime = (): boolean => {
    if (opts.forceHeadless) return true;
    if (process.platform === 'linux') {
      return !process.env.DISPLAY || process.env.DISPLAY.length === 0;
    }
    return false;
  };

  const useDeviceCode = opts.flow === 'device-code' || (opts.flow !== 'auth-code' && isHeadlessRuntime());

  appendAuthAuditEvent({
    event: 'oauth-login-started',
    org,
    backend: probeBackend(),
    flow: useDeviceCode ? 'device-code' : 'auth-code',
    clientIdSource: oauthConfig.clientIdSource,
  });

  let credential: StoredOAuthCredential;
  let flowUsed: OAuthFlow;
  try {
    if (useDeviceCode) {
      const r = await runDeviceCodeFlow(org, oauthConfig);
      credential = r.credential;
      flowUsed = 'device-code';
    } else {
      const r = await runAuthCodeFlow(org, oauthConfig);
      credential = r.credential;
      flowUsed = 'auth-code';
    }
  } catch (err) {
    const reason =
      typeof err === 'object' && err !== null && 'reason' in err
        ? (err as { reason: string }).reason
        : 'unknown';
    appendAuthAuditEvent({
      event: 'oauth-login-failed',
      org,
      backend: probeBackend(),
      flow: useDeviceCode ? 'device-code' : 'auth-code',
      reason,
    });
    throw err;
  }

  // storeOAuthCredential emits its own oauth-login-success audit event.
  await storeOAuthCredential(org, credential);

  return {
    org,
    kind: 'oauth',
    accountId: credential.accountId,
    expiresAt: credential.expiresAt,
    scope: credential.scope,
    flowUsed,
  };
}

export interface LogoutResult {
  removed: { org: string; kind: 'pat' | 'oauth' }[];
}

export async function logout(opts: { org?: string; all?: boolean } = {}): Promise<LogoutResult> {
  if (opts.all) {
    const orgs = await listOrgsWithStoredPat();
    const removed: { org: string; kind: 'pat' | 'oauth' }[] = [];
    for (const o of orgs) {
      const cred = await getStoredCredential(o);
      const ok = await removeStored(o);
      if (ok && cred !== null) {
        removed.push({ org: o, kind: cred.kind });
      }
    }
    return { removed };
  }
  if (!opts.org) {
    throw new Error('logout requires an org or --all');
  }
  const cred = await getStoredCredential(opts.org);
  const ok = await removeStored(opts.org);
  return { removed: ok && cred !== null ? [{ org: opts.org, kind: cred.kind }] : [] };
}

export interface StatusReportEntry {
  org: string;
  kind: 'pat' | 'oauth';
  accountId?: string;
  expiresAt?: number;
  scope?: string;
  backend: ReturnType<typeof probeBackend>;
}

export interface StatusReport {
  orgs: StatusReportEntry[];
}

/**
 * Read-only summary suitable for `azdo auth status`. Returns metadata only —
 * NEVER token material.
 */
export async function status(): Promise<StatusReport> {
  const orgs = await listOrgsWithStoredPat();
  const out: StatusReportEntry[] = [];
  for (const org of orgs) {
    const cred = await getStoredCredential(org);
    if (cred === null) continue;
    if (cred.kind === 'pat') {
      out.push({ org, kind: 'pat', backend: probeBackend() });
    } else {
      out.push({
        org,
        kind: 'oauth',
        accountId: cred.accountId,
        expiresAt: cred.expiresAt,
        scope: cred.scope,
        backend: probeBackend(),
      });
    }
  }
  return { orgs: out };
}

/**
 * Resolve a UsableCredential — used by the read-side callers (azdo-client /
 * pr-client) to attach the correct Authorization header. For OAuth, transparently
 * refreshes if past expiry. NEVER deletes a stored credential on refresh failure;
 * surfaces CredentialRefreshError so the caller can print FR-014's instructions.
 */
export async function resolveCredential(org: string): Promise<UsableCredential> {
  const envPat = process.env.AZDO_PAT;
  if (envPat && envPat.length > 0) {
    return { kind: 'pat', token: envPat };
  }
  const stored: StoredCredential | null = await getStoredCredential(org);
  if (stored === null) {
    const dotEnvPat = findDotEnvPat();
    if (dotEnvPat !== null) {
      return { kind: 'pat', token: dotEnvPat };
    }
    throw new CredentialMissingError(org);
  }
  if (stored.kind === 'pat') {
    return { kind: 'pat', token: stored.token };
  }
  let fresh: StoredOAuthCredential;
  try {
    fresh = await refreshIfNeeded(org, stored);
  } catch (err) {
    if (err instanceof CredentialRefreshError) {
      throw err;
    }
    throw err;
  }
  return { kind: 'oauth', bearerToken: fresh.accessToken, accountId: fresh.accountId };
}

// Re-exported types for callers
export type { UsableCredential };
