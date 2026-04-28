import { Entry } from '@napi-rs/keyring';
import type { CredentialBackend, StoredCredential, StoredOAuthCredential, StoredPatCredential } from '../types/credential.js';
import { CredentialStoreUnavailableError } from '../types/credential.js';
import { appendAuthAuditEvent, readAuditEvents } from './audit-log.js';
import { loadConfig } from './config-store.js';
import { maskedDisplay } from './auth-masking.js';

const SERVICE = 'azdo-cli';
const LEGACY_ACCOUNT = 'pat';

function accountFor(org: string): string {
  return `pat:${org}`;
}

export function probeBackend(): CredentialBackend {
  switch (process.platform) {
    case 'win32':
      return 'windows-credential-manager';
    case 'darwin':
      return 'macos-keychain';
    case 'linux':
      return 'linux-libsecret';
    default:
      return 'unknown';
  }
}

function wrapUnavailable<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw new CredentialStoreUnavailableError(probeBackend(), err);
  }
}

let legacyUnsetNoticeEmitted = false;

function emitLegacyUnsetNoticeOnce(): void {
  if (legacyUnsetNoticeEmitted) return;
  legacyUnsetNoticeEmitted = true;
  process.stderr.write(
    'A legacy PAT exists in the OS vault from a previous azdo-cli version, but no "org" is set in config. ' +
      'Run `azdo auth --org <name>` to re-store it under the per-org key, then `azdo clear-pat` to remove the legacy slot.\n',
  );
}

// exported for tests
export function _resetLegacyNoticeFlag(): void {
  legacyUnsetNoticeEmitted = false;
}

function isValidOAuthEnvelope(value: unknown): value is StoredOAuthCredential {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.kind !== 'oauth') return false;
  if (typeof v.accessToken !== 'string' || v.accessToken.length === 0) return false;
  if (v.refreshToken !== null && typeof v.refreshToken !== 'string') return false;
  if (typeof v.expiresAt !== 'number' || typeof v.issuedAt !== 'number') return false;
  if (v.expiresAt <= v.issuedAt) return false;
  if (v.expiresAt - v.issuedAt > 24 * 3600) return false;
  if (typeof v.accountId !== 'string' || typeof v.scope !== 'string' || typeof v.tenantId !== 'string') {
    return false;
  }
  return true;
}

function isValidPatEnvelope(value: unknown): value is StoredPatCredential {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.kind === 'pat' && typeof v.token === 'string' && v.token.length > 0;
}

/**
 * Parse a stored keyring value into a StoredCredential. A non-JSON value or a
 * JSON value without a `kind` field is treated as a legacy bare PAT (migration
 * rule). A JSON value with an unknown kind throws CredentialStoreUnavailableError.
 */
export function parseStoredValue(raw: string): StoredCredential {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'pat', token: raw };
  }

  if (!parsed || typeof parsed !== 'object' || !('kind' in parsed)) {
    return { kind: 'pat', token: raw };
  }

  if (isValidOAuthEnvelope(parsed)) {
    return parsed;
  }
  if (isValidPatEnvelope(parsed)) {
    return parsed;
  }

  throw new CredentialStoreUnavailableError(
    probeBackend(),
    new Error(`unknown or invalid credential envelope kind`),
  );
}

function serializeCredential(cred: StoredCredential): string {
  if (cred.kind === 'oauth') {
    if (cred.expiresAt <= cred.issuedAt) {
      throw new Error('expiresAt must be greater than issuedAt');
    }
    if (cred.expiresAt - cred.issuedAt > 24 * 3600) {
      throw new Error('OAuth access-token lifetime exceeds 24h sanity bound');
    }
    if (!cred.accessToken) {
      throw new Error('OAuth credential missing accessToken');
    }
  } else if (!cred.token) {
    throw new Error('PAT credential missing token');
  }
  return JSON.stringify(cred);
}

async function maybeMigrateLegacy(targetOrg: string): Promise<string | null> {
  const config = loadConfig();
  if (!config.org || config.org !== targetOrg) {
    if (!config.org) {
      let legacyExists: boolean;
      try {
        const legacyEntry = new Entry(SERVICE, LEGACY_ACCOUNT);
        legacyExists = legacyEntry.getPassword() !== null;
      } catch {
        legacyExists = false;
      }
      if (legacyExists) {
        emitLegacyUnsetNoticeOnce();
      }
    }
    return null;
  }
  const newEntry = new Entry(SERVICE, accountFor(targetOrg));
  const existingNew = wrapUnavailable(() => newEntry.getPassword());
  if (existingNew !== null) {
    return null;
  }
  const legacyEntry = new Entry(SERVICE, LEGACY_ACCOUNT);
  const legacy = wrapUnavailable(() => legacyEntry.getPassword());
  if (legacy === null) {
    return null;
  }
  wrapUnavailable(() => {
    newEntry.setPassword(legacy);
    legacyEntry.deletePassword();
  });
  appendAuthAuditEvent({
    event: 'auth.store',
    org: targetOrg,
    backend: probeBackend(),
    masked_pat: maskedDisplay(legacy),
  });
  process.stderr.write(`Migrated legacy PAT to org ${targetOrg}.\n`);
  return legacy;
}

/**
 * Backwards-compatible read of a stored PAT (returns the raw token string for
 * existing callers that still expect a bare string). Returns null if the
 * stored credential is OAuth — those callers should migrate to
 * getStoredCredential().
 */
export async function getPat(org: string): Promise<string | null> {
  const cred = await getStoredCredential(org);
  if (cred === null) return null;
  if (cred.kind === 'pat') return cred.token;
  return null;
}

export async function getStoredCredential(org: string): Promise<StoredCredential | null> {
  const entry = new Entry(SERVICE, accountFor(org));
  const value = wrapUnavailable(() => entry.getPassword());
  if (value === null) {
    const migrated = await maybeMigrateLegacy(org);
    if (migrated === null) return null;
    return parseStoredValue(migrated);
  }
  return parseStoredValue(value);
}

/**
 * Persist a bare PAT under the per-org slot wrapped in the JSON envelope.
 * Existing callers that pass a raw string keep working — the envelope is
 * transparent on the read path because legacy bare-PAT entries are also
 * tolerated.
 */
export async function storePat(org: string, pat: string): Promise<void> {
  const cred: StoredPatCredential = { kind: 'pat', token: pat };
  const entry = new Entry(SERVICE, accountFor(org));
  wrapUnavailable(() => entry.setPassword(serializeCredential(cred)));
  appendAuthAuditEvent({
    event: 'auth.store',
    org,
    backend: probeBackend(),
    masked_pat: maskedDisplay(pat),
  });
}

export async function storeOAuthCredential(org: string, cred: StoredOAuthCredential): Promise<void> {
  const entry = new Entry(SERVICE, accountFor(org));
  wrapUnavailable(() => entry.setPassword(serializeCredential(cred)));
  appendAuthAuditEvent({
    event: 'oauth-login-success',
    org,
    backend: probeBackend(),
    accountId: cred.accountId,
    scope: cred.scope,
    tokenLifetimeSec: cred.expiresAt - cred.issuedAt,
  });
}

export async function deletePat(org: string): Promise<boolean> {
  const entry = new Entry(SERVICE, accountFor(org));
  const existing = wrapUnavailable(() => entry.getPassword());
  if (existing === null) {
    return false;
  }
  let parsed: StoredCredential;
  try {
    parsed = parseStoredValue(existing);
  } catch {
    parsed = { kind: 'pat', token: existing };
  }
  wrapUnavailable(() => entry.deletePassword());
  if (parsed.kind === 'oauth') {
    appendAuthAuditEvent({
      event: 'oauth-logout',
      org,
      backend: probeBackend(),
      accountId: parsed.accountId,
    });
  } else {
    appendAuthAuditEvent({
      event: 'auth.delete',
      org,
      backend: probeBackend(),
      masked_pat: maskedDisplay(parsed.token),
    });
  }
  // Best-effort cleanup of any stale refresh-lock file. Reuse the same path
  // helper as oauth-token-refresh so org names with characters outside
  // [A-Za-z0-9_.-] resolve to the same sanitised file name on both write and
  // delete sides — otherwise orgs with `/` or `:` would leave lock files behind.
  try {
    const { unlinkSync } = await import('node:fs');
    const { lockPath } = await import('./oauth-token-refresh.js');
    unlinkSync(lockPath(org));
  } catch {
    // no-op — lock file absent is the normal case
  }
  return true;
}

export async function listOrgsWithStoredPat(): Promise<string[]> {
  const seen = new Set<string>();
  for (const ev of readAuditEvents()) {
    if (ev.event === 'auth.store' || ev.event === 'oauth-login-success') {
      seen.add(ev.org);
    } else if (ev.event === 'auth.delete' || ev.event === 'oauth-logout') {
      seen.delete(ev.org);
    }
  }
  const present: string[] = [];
  for (const org of seen) {
    const entry = new Entry(SERVICE, accountFor(org));
    const value = wrapUnavailable(() => entry.getPassword());
    if (value !== null) {
      present.push(org);
    }
  }
  present.sort((a, b) => a.localeCompare(b));
  return present;
}
