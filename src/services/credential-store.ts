import { Entry } from '@napi-rs/keyring';
import type { CredentialBackend, StoredCredential, StoredOAuthCredential, StoredPatCredential } from '../types/credential.js';
import { CredentialStoreUnavailableError } from '../types/credential.js';
import { appendAuthAuditEvent, readAuditEvents } from './audit-log.js';
import { loadConfig } from './config-store.js';
import { parseCredentialStore } from './credential-store-kind.js';
import { maskedDisplay } from './auth-masking.js';
import { DpapiEntry, type SecretEntry } from './dpapi-store.js';
import type { CredentialStoreKind } from '../types/work-item.js';

const SERVICE = 'azdo-cli';
const LEGACY_ACCOUNT = 'pat';

function accountFor(org: string): string {
  return `pat:${org}`;
}

/**
 * The value asked for — `AZDO_CREDENTIAL_STORE` over the global
 * `credentialStore` config key — without validating it. Defaults to `keyring`.
 */
function requestedStore(): string {
  const fromEnv = process.env.AZDO_CREDENTIAL_STORE?.trim();
  if (fromEnv) return fromEnv.toLowerCase();
  let fromConfig: string | undefined;
  try {
    fromConfig = loadConfig()?.credentialStore;
  } catch {
    fromConfig = undefined;
  }
  return fromConfig?.trim().toLowerCase() || 'keyring';
}

/**
 * The credential store in effect. An invalid value, or `dpapi` off Windows, is
 * a CredentialStoreUnavailableError (exit 4) — never a silent fall-back to the
 * keyring, which would put the credential somewhere the user did not choose.
 */
export function activeCredentialStore(): CredentialStoreKind {
  const requested = requestedStore();
  try {
    return parseCredentialStore(requested);
  } catch (err) {
    const backend = requested === 'dpapi' ? 'windows-dpapi' : 'unknown';
    throw new CredentialStoreUnavailableError(
      backend,
      err,
      `${(err as Error).message} Set it with \`azdo config set credentialStore <keyring|dpapi>\` or AZDO_CREDENTIAL_STORE.`,
    );
  }
}

export function probeBackend(): CredentialBackend {
  if (requestedStore() === 'dpapi') return 'windows-dpapi';
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

function wrapUnavailableAs<T>(backend: CredentialBackend, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    // The DPAPI store already raises its own, more specific message.
    if (err instanceof CredentialStoreUnavailableError) throw err;
    throw new CredentialStoreUnavailableError(backend, err);
  }
}

function wrapUnavailable<T>(fn: () => T): T {
  return wrapUnavailableAs(probeBackend(), fn);
}

// Construction itself can throw on platforms where the keyring backend is
// missing (e.g. headless Linux without a Secret Service). Wrap so the
// resulting error is the friendly CredentialStoreUnavailableError instead
// of a raw napi-rs stack.
function entryFor(account: string): SecretEntry {
  if (activeCredentialStore() === 'dpapi') return new DpapiEntry(account);
  return wrapUnavailable(() => new Entry(SERVICE, account));
}

let legacyUnsetNoticeEmitted = false;
let noticesSuppressed = false;

/**
 * Silence this module's advisory stderr notices (the legacy-PAT migration and
 * unset-org hints) for the rest of the process.
 *
 * `azdo auth token` promises a *silent* stderr when stderr is not a terminal —
 * a caller doing `TOKEN=$(azdo auth token) 2>/dev/null` is fine, but one that
 * merges the streams would otherwise get "Migrated legacy PAT..." interleaved
 * with the credential. The migration itself still happens and is still recorded
 * as an `auth.store` audit event; only the human-facing line is dropped.
 */
export function suppressCredentialStoreNotices(suppressed: boolean): void {
  noticesSuppressed = suppressed;
}

function writeNotice(message: string): void {
  if (noticesSuppressed) return;
  process.stderr.write(message);
}

function emitLegacyUnsetNoticeOnce(): void {
  if (legacyUnsetNoticeEmitted) return;
  legacyUnsetNoticeEmitted = true;
  writeNotice(
    'A legacy PAT exists in the OS vault from a previous azdo-cli version, but no "org" is set in config. ' +
      'Run `azdo auth --org <name>` to re-store it under the per-org key, then `azdo clear-pat` to remove the legacy slot.\n',
  );
}

// exported for tests
export function _resetLegacyNoticeFlag(): void {
  legacyUnsetNoticeEmitted = false;
  noticesSuppressed = false;
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
  // The pre-multi-org `pat` slot only ever existed in the OS keyring, and
  // switching stores deliberately moves nothing.
  if (activeCredentialStore() === 'dpapi') return null;
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
  const newEntry = entryFor(accountFor(targetOrg));
  const existingNew = wrapUnavailable(() => newEntry.getPassword());
  if (existingNew !== null) {
    return null;
  }
  const legacyEntry = entryFor(LEGACY_ACCOUNT);
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
  writeNotice(`Migrated legacy PAT to org ${targetOrg}.\n`);
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
  const entry = entryFor(accountFor(org));
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
  const entry = entryFor(accountFor(org));
  wrapUnavailable(() => entry.setPassword(serializeCredential(cred)));
  appendAuthAuditEvent({
    event: 'auth.store',
    org,
    backend: probeBackend(),
    masked_pat: maskedDisplay(pat),
  });
}

/**
 * Pure persistence helper: write the OAuth credential to the OS keyring.
 *
 * Does NOT emit `oauth-login-success`. That event records *interactive
 * login* outcomes and needs the call-site context (which flow ran, where
 * the client id came from) that this helper does not have. The login
 * call site (`loginWithOAuth` in `services/auth.ts`) emits the event
 * itself after persisting. The refresh path also calls this helper but
 * deliberately emits `oauth-refresh-success` instead — refreshes are
 * not logins.
 */
export async function storeOAuthCredential(org: string, cred: StoredOAuthCredential): Promise<void> {
  const entry = entryFor(accountFor(org));
  wrapUnavailable(() => entry.setPassword(serializeCredential(cred)));
}

export async function deletePat(org: string): Promise<boolean> {
  const entry = entryFor(accountFor(org));
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
    const entry = entryFor(accountFor(org));
    const value = wrapUnavailable(() => entry.getPassword());
    if (value !== null) {
      present.push(org);
    }
  }
  present.sort((a, b) => a.localeCompare(b));
  return present;
}

/** What copying the OS keyring's credentials into the DPAPI store did, per org. */
export interface KeyringToDpapiCopy {
  copied: string[];
  /** Already present in the DPAPI store — never overwritten. */
  skipped: string[];
  failed: { org: string; message: string }[];
}

function keyringEntry(account: string): SecretEntry {
  return new Entry(SERVICE, account);
}

/**
 * Every org the CLI has ever stored a credential for (audit log) or has
 * config for, sorted. Deletions are not replayed: a logout from the DPAPI
 * store leaves the keyring entry alone, so only probing the keyring decides.
 */
function knownOrgs(): string[] {
  const orgs = new Set<string>();
  for (const ev of readAuditEvents()) {
    if (ev.event === 'auth.store' || ev.event === 'oauth-login-success') orgs.add(ev.org);
  }
  try {
    const config = loadConfig();
    if (config.org) orgs.add(config.org);
    for (const name of Object.keys(config.organizations ?? {})) orgs.add(name);
  } catch {
    // an unreadable config only narrows the candidates
  }
  return [...orgs].sort((a, b) => a.localeCompare(b));
}

/**
 * Orgs that have a credential in the OS keyring (Credential Manager on
 * Windows), whatever store is currently selected. Throws
 * CredentialStoreUnavailableError when the keyring cannot be reached at all —
 * the usual case over OpenSSH, and the reason to switch in the first place.
 */
export function listKeyringCredentials(): string[] {
  const present: string[] = [];
  for (const org of knownOrgs()) {
    const value = wrapUnavailableAs('windows-credential-manager', () =>
      keyringEntry(accountFor(org)).getPassword(),
    );
    if (value !== null) present.push(org);
  }
  return present;
}

/**
 * Copy each org's keyring credential into the DPAPI store, value for value
 * (PAT or OAuth envelope alike). The keyring entry is left in place, so
 * switching back to `keyring` still finds it, and an org already present in
 * the DPAPI store is skipped rather than overwritten. One org failing — e.g.
 * a session that cannot use the DPAPI master key — does not stop the others.
 */
export function copyKeyringCredentialsToDpapi(orgs: readonly string[]): KeyringToDpapiCopy {
  const result: KeyringToDpapiCopy = { copied: [], skipped: [], failed: [] };
  for (const org of orgs) {
    try {
      const raw = wrapUnavailableAs('windows-credential-manager', () =>
        keyringEntry(accountFor(org)).getPassword(),
      );
      if (raw === null) continue;
      const target = new DpapiEntry(accountFor(org));
      if (target.getPassword() !== null) {
        result.skipped.push(org);
        continue;
      }
      const cred = parseStoredValue(raw);
      target.setPassword(raw);
      appendAuthAuditEvent({
        event: 'auth.store',
        org,
        backend: 'windows-dpapi',
        ...(cred.kind === 'pat' ? { masked_pat: maskedDisplay(cred.token) } : { accountId: cred.accountId }),
      });
      result.copied.push(org);
    } catch (err) {
      result.failed.push({ org, message: (err as Error).message });
    }
  }
  return result;
}
