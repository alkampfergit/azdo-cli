import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  AuthAuditEvent,
  AuthAuditEventKind,
  OAuthClientIdSource,
  OAuthFlow,
  OAuthLoginFailedReason,
  OAuthRefreshFailedReason,
} from '../types/audit.js';
import type { CredentialBackend } from '../types/credential.js';

export function getAuditLogPath(): string {
  return path.join(os.homedir(), '.azdo', 'audit.log');
}

function ensureDirWithPerms(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return;
  }
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // best-effort — permissions may not be changeable on some platforms
  }
}

function ensureFileWithPerms(file: string): void {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, '', { mode: 0o600 });
    return;
  }
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // best-effort
  }
}

export interface AppendInput {
  event: AuthAuditEventKind;
  org: string;
  backend: CredentialBackend;
  masked_pat?: string;
  flow?: OAuthFlow;
  clientIdSource?: OAuthClientIdSource;
  accountId?: string;
  scope?: string;
  tokenLifetimeSec?: number;
  reason?: OAuthLoginFailedReason | OAuthRefreshFailedReason;
}

const FORBIDDEN_FIELDS = new Set([
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'pat',
]);

function stripForbidden(input: AppendInput): AppendInput {
  const out: Record<string, unknown> = { ...(input as unknown as Record<string, unknown>) };
  for (const key of Object.keys(out)) {
    if (FORBIDDEN_FIELDS.has(key)) {
      delete out[key];
    }
  }
  return out as unknown as AppendInput;
}

function whenSet<T>(value: T | undefined, key: string): Record<string, T> {
  return value === undefined ? {} : ({ [key]: value } as Record<string, T>);
}

export function appendAuthAuditEvent(input: AppendInput): void {
  const auditLog = getAuditLogPath();
  const dir = path.dirname(auditLog);

  ensureDirWithPerms(dir);
  ensureFileWithPerms(auditLog);

  const safe = stripForbidden(input);

  const record: AuthAuditEvent = {
    ts: new Date().toISOString(),
    event: safe.event,
    org: safe.org,
    backend: safe.backend,
    ...whenSet(safe.masked_pat, 'masked_pat'),
    ...whenSet(safe.flow, 'flow'),
    ...whenSet(safe.clientIdSource, 'clientIdSource'),
    ...whenSet(safe.accountId, 'accountId'),
    ...whenSet(safe.scope, 'scope'),
    ...whenSet(safe.tokenLifetimeSec, 'tokenLifetimeSec'),
    ...whenSet(safe.reason, 'reason'),
  };

  fs.appendFileSync(auditLog, `${JSON.stringify(record)}\n`);
}

export function readAuditEvents(): AuthAuditEvent[] {
  const auditLog = getAuditLogPath();
  if (!fs.existsSync(auditLog)) {
    return [];
  }
  const contents = fs.readFileSync(auditLog, 'utf8');
  const out: AuthAuditEvent[] = [];
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as AuthAuditEvent;
      if (parsed && typeof parsed === 'object' && typeof parsed.event === 'string') {
        out.push(parsed);
      }
    } catch {
      // skip corrupt line
    }
  }
  return out;
}
