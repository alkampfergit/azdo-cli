import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redactHeaders, redactUrl, redactBody, redactText, TraceWriter, initTraceWriter } from '../../src/services/trace-writer.js';
import type { TraceEntry } from '../../src/types/auth-diagnostics.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';

describe('redactHeaders', () => {
  it('redacts Authorization header', () => {
    const result = redactHeaders({ Authorization: 'Basic abc123', 'Content-Type': 'application/json' });
    expect(result['Authorization']).toBe('[REDACTED]');
    expect(result['Content-Type']).toBe('application/json');
  });

  it('redacts x-*-token headers case-insensitively', () => {
    const result = redactHeaders({ 'X-Auth-Token': 'secret', Accept: 'application/json' });
    expect(result['X-Auth-Token']).toBe('[REDACTED]');
    expect(result['Accept']).toBe('application/json');
  });

  it('passes through non-sensitive headers', () => {
    const result = redactHeaders({ 'Content-Type': 'text/plain', Accept: '*/*' });
    expect(result['Content-Type']).toBe('text/plain');
    expect(result['Accept']).toBe('*/*');
  });
});

describe('redactUrl', () => {
  it('redacts token query param', () => {
    const result = redactUrl('https://dev.azure.com/org/_apis/test?token=secret&api-version=7.1');
    expect(result).not.toContain('secret');
    expect(result).toContain('api-version=7.1');
    // URL.searchParams.set() percent-encodes brackets, so check decoded form
    expect(decodeURIComponent(result)).toContain('[REDACTED]');
  });

  it('redacts pat query param', () => {
    const result = redactUrl('https://dev.azure.com/org/_apis/test?pat=abc123');
    expect(result).not.toContain('abc123');
  });

  it('passes through non-sensitive query params', () => {
    const result = redactUrl('https://dev.azure.com/org/_apis/projects?api-version=7.1&$top=1');
    expect(result).toBe('https://dev.azure.com/org/_apis/projects?api-version=7.1&$top=1');
  });

  it('returns original url if not parseable', () => {
    const result = redactUrl('not-a-url');
    expect(result).toBe('not-a-url');
  });
});

describe('redactBody', () => {
  it('returns null for null input', () => {
    expect(redactBody(null)).toBeNull();
  });

  it('redacts token field in JSON body', () => {
    const body = JSON.stringify({ token: 'secret', name: 'test' });
    const result = redactBody(body);
    expect(result).not.toContain('secret');
    expect(result).toContain('name');
  });

  it('redacts accessToken field', () => {
    const body = JSON.stringify({ accessToken: 'tok123', scope: 'vso.work' });
    const result = redactBody(body);
    expect(result).not.toContain('tok123');
    expect(result).toContain('scope');
  });

  it('passes through non-JSON body unchanged', () => {
    const body = 'plain text body';
    expect(redactBody(body)).toBe(body);
  });

  it('passes through JSON without sensitive fields unchanged', () => {
    const body = JSON.stringify({ name: 'value', count: 3 });
    expect(redactBody(body)).toBe(body);
  });
});

describe('TraceWriter', () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = join(tmpdir(), `trace-test-${Date.now()}.ndjson`);
  });

  afterEach(() => {
    if (existsSync(tmpFile)) {
      unlinkSync(tmpFile);
    }
  });

  it('creates file and appends NDJSON entries', () => {
    const writer = new TraceWriter(tmpFile);
    const entry: TraceEntry = {
      timestamp: '2024-01-01T00:00:00.000Z',
      method: 'GET',
      url: 'https://dev.azure.com/org/_apis/projects',
      requestHeaders: { Accept: 'application/json' },
      requestBody: null,
      responseStatus: 200,
      responseHeaders: { 'content-type': 'application/json' },
      responseBody: '{"value":[]}',
    };
    writer.append(entry);
    writer.close();

    const content = readFileSync(tmpFile, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!) as unknown as TraceEntry;
    expect(parsed.method).toBe('GET');
    expect(parsed.responseStatus).toBe(200);
  });

  it('appends multiple entries', () => {
    const writer = new TraceWriter(tmpFile);
    const entry: TraceEntry = {
      timestamp: '2024-01-01T00:00:00.000Z',
      method: 'POST',
      url: 'https://dev.azure.com/org/_apis/test',
      requestHeaders: {},
      requestBody: '{"key":"value"}',
      responseStatus: 201,
      responseHeaders: {},
      responseBody: '',
    };
    writer.append(entry);
    writer.append({ ...entry, method: 'GET', responseStatus: 200 });
    writer.close();

    const content = readFileSync(tmpFile, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
  });
});

describe('initTraceWriter / getActiveTraceWriter', () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = join(tmpdir(), `trace-init-test-${Date.now()}.ndjson`);
    // Reset module-level state by re-importing (workaround: test via side effects)
  });

  afterEach(() => {
    if (existsSync(tmpFile)) {
      unlinkSync(tmpFile);
    }
  });

  it('warns to stderr on bad path (does not throw)', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    initTraceWriter('/no/such/directory/trace.log');
    stderrSpy.mockRestore();
    // no exception thrown is the pass condition
  });
});

// `redactBody` only rewrites recognised JSON fields, so anything that will not
// parse as JSON reached the console untouched. `redactText` is the guarantee
// behind "tokens are never echoed" for those bodies.
describe('redactText', () => {
  const secret = 'ab2cd3ef4gh5ij6kl7mn8op9qr0st1uv2wx3yz4ab5cd6ef7gh8ij';

  it('redacts a bearer token while keeping the scheme', () => {
    expect(redactText('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'))
      .toBe('Authorization: Bearer [REDACTED]');
  });

  it('redacts a basic credential', () => {
    expect(redactText(`Basic ${secret}`)).toBe('Basic [REDACTED]');
  });

  it('redacts a key=value secret in plain text, keeping the key', () => {
    expect(redactText('pat=hunter2-and-more')).toBe('pat=[REDACTED]');
    expect(redactText('accessToken: "s3cr3t-value"')).toBe('accessToken: "[REDACTED]"');
  });

  it('redacts a bare token-shaped run', () => {
    expect(redactText(`rejected ${secret} for user`)).toBe('rejected [REDACTED] for user');
  });

  it('leaves ordinary prose and long letter-only words alone', () => {
    const prose = `the request was rejected because ${'x'.repeat(60)} is not a valid area path`;
    expect(redactText(prose)).toBe(prose);
  });

  it('is a no-op on text with nothing secret-shaped', () => {
    expect(redactText('TF401232: Work item field reference is invalid: Foo.Bar'))
      .toBe('TF401232: Work item field reference is invalid: Foo.Bar');
  });
});
