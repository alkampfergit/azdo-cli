import { Entry } from '@napi-rs/keyring';
import type { CredentialBackend } from '../types/credential.js';
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

async function maybeMigrateLegacy(targetOrg: string): Promise<string | null> {
  const config = loadConfig();
  if (!config.org || config.org !== targetOrg) {
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

export async function getPat(org: string): Promise<string | null> {
  const entry = new Entry(SERVICE, accountFor(org));
  const value = wrapUnavailable(() => entry.getPassword());
  if (value !== null) {
    return value;
  }
  const migrated = await maybeMigrateLegacy(org);
  return migrated;
}

export async function storePat(org: string, pat: string): Promise<void> {
  const entry = new Entry(SERVICE, accountFor(org));
  wrapUnavailable(() => entry.setPassword(pat));
  appendAuthAuditEvent({
    event: 'auth.store',
    org,
    backend: probeBackend(),
    masked_pat: maskedDisplay(pat),
  });
}

export async function deletePat(org: string): Promise<boolean> {
  const entry = new Entry(SERVICE, accountFor(org));
  const existing = wrapUnavailable(() => entry.getPassword());
  if (existing === null) {
    return false;
  }
  wrapUnavailable(() => entry.deletePassword());
  appendAuthAuditEvent({
    event: 'auth.delete',
    org,
    backend: probeBackend(),
    masked_pat: maskedDisplay(existing),
  });
  return true;
}

export async function listOrgsWithStoredPat(): Promise<string[]> {
  const seen = new Set<string>();
  for (const ev of readAuditEvents()) {
    if (ev.event === 'auth.store') {
      seen.add(ev.org);
    } else if (ev.event === 'auth.delete') {
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
