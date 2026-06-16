import { openSync, writeSync, closeSync } from 'node:fs';
import { platform } from 'node:os';
import type { TraceEntry } from '../types/auth-diagnostics.js';

const REDACTED = '[REDACTED]';
const SENSITIVE_HEADER = /^(authorization|x-.*token)$/i;
const SENSITIVE_QUERY_PARAM = /^(token|pat)$/i;
const SENSITIVE_BODY_FIELD = /^(token|accessToken|pat)$/;

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADER.test(key) ? REDACTED : value;
  }
  return out;
}

export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const [key] of u.searchParams.entries()) {
      if (SENSITIVE_QUERY_PARAM.test(key)) {
        u.searchParams.set(key, REDACTED);
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}

export function redactBody(body: string | null): string | null {
  if (body === null) return null;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    let changed = false;
    const redacted: Record<string, unknown> = { ...parsed };
    for (const key of Object.keys(parsed)) {
      if (SENSITIVE_BODY_FIELD.test(key)) {
        redacted[key] = REDACTED;
        changed = true;
      }
    }
    return changed ? JSON.stringify(redacted) : body;
  } catch {
    return body;
  }
}

export class TraceWriter {
  private readonly fd: number;

  constructor(filepath: string) {
    // 0o600 = owner read/write only (ignored on Windows but harmless)
    const mode = platform() === 'win32' ? undefined : 0o600;
    this.fd = openSync(filepath, 'a', mode);
  }

  append(entry: TraceEntry): void {
    const line = JSON.stringify(entry) + '\n\n';
    writeSync(this.fd, line);
  }

  close(): void {
    closeSync(this.fd);
  }
}

let activeWriter: TraceWriter | null = null;

export function initTraceWriter(filepath: string): void {
  try {
    activeWriter = new TraceWriter(filepath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Warning: could not open trace file "${filepath}": ${msg}\n`);
  }
}

export function getActiveTraceWriter(): TraceWriter | null {
  return activeWriter;
}
