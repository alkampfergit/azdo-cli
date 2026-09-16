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

// Secret-shaped substrings in free text. `redactBody` only rewrites *JSON*
// fields it recognises, so anything that will not parse as JSON — a `text/plain`
// error page, a stack trace, a form-encoded payload — reached the console with
// whatever it carried. These rules are the last line of defence for that path:
// an `Authorization`-style scheme + token, a `token`/`pat`/`secret` key=value
// pair in any syntax, a JWT, and any long mixed letter-and-digit run (an Azure
// DevOps PAT is 52 base32 characters). The last rule requires both a letter and
// a digit so an ordinary long word is left alone.

const SECRET_ASSIGNMENT = String.raw`["']?\s*[:=]\s*["']?)[^"'\s,;&}]+`;
const SECRET_IN_TEXT: readonly (readonly [RegExp, string])[] = [
  [/\b(Bearer|Basic)\s+[\w.~+/=-]{8,}/gi, `$1 ${REDACTED}`],
  [new RegExp(String.raw`(\b(?:access|refresh|api)[_-]?(?:token|key)\b${SECRET_ASSIGNMENT}`, 'gi'), `$1${REDACTED}`],
  [new RegExp(String.raw`(\b(?:token|pat|password|secret)\b${SECRET_ASSIGNMENT}`, 'gi'), `$1${REDACTED}`],
  [/\beyJ[A-Za-z0-9._~+/=-]{20,}/g, REDACTED],
  [/\b(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{40,}\b/g, REDACTED],
];

/**
 * Redacts secret-shaped substrings from free text that is about to be shown to
 * a user. Complements `redactBody`, which only understands JSON objects and so
 * leaves a `text/plain` body exactly as the server sent it.
 */
export function redactText(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SECRET_IN_TEXT) {
    out = out.replace(pattern, replacement);
  }
  return out;
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
