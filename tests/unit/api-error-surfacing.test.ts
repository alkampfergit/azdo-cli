import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import {
  describeFailureBody,
  getOrgFieldNames,
  getWorkItem,
  httpError,
} from '../../src/services/azdo-client.js';
import { testContext as ctx, testPat as pat } from './helpers/api-test-utils.js';

// Tracing is off by default; `trace.writer` turns it on for the one test that
// needs to prove the capture still works when the trace clone fails.
const trace = vi.hoisted(() => ({ writer: null as { append: (entry: unknown) => void } | null }));
vi.mock('../../src/services/trace-writer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/trace-writer.js')>();
  return { ...actual, getActiveTraceWriter: () => trace.writer };
});

// Every error thrown by the HTTP layer now carries whatever Azure DevOps said
// about the failure, with the sentinel preserved as a prefix (contract C-1).
// Before this, a 400/500 surfaced as `HTTP_400` and the body — the only place
// the real reason lives — was read for the trace file and dropped.

function makeResponse(status: number, body: string, contentType = 'application/json'): Response {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': contentType }),
    text: async () => body,
    json: async () => JSON.parse(body) as unknown,
    clone: () => response,
  };
  return response as unknown as Response;
}

describe('describeFailureBody', () => {
  const cases: [string, string, string, string | null][] = [
    ['JSON message', '{"message":"Boom"}', 'application/json', 'Boom'],
    [
      'message + typeKey',
      '{"message":"Boom","typeKey":"InvalidArgumentValueException"}',
      'application/json',
      'Boom [InvalidArgumentValueException]',
    ],
    ['typeKey only', '{"typeKey":"RuleValidationException"}', 'application/json', '[RuleValidationException]'],
    ['numeric errorCode', '{"errorCode":600171}', 'application/json', '[errorCode 600171]'],
    ['non-JSON body', 'upstream connect error', 'text/plain', 'upstream connect error'],
    ['empty body', '', 'application/json', null],
    ['whitespace body', '   \n ', 'application/json', null],
    ['HTML body', '<!DOCTYPE html><html>Sign in</html>', 'text/html; charset=utf-8', null],
    ['HTML body mislabelled as JSON', '<!DOCTYPE html><html>Sign in</html>', 'application/json', null],
  ];

  it.each(cases)('renders %s', (_label, body, contentType, expected) => {
    expect(describeFailureBody(body, contentType)).toBe(expected);
  });

  it('returns null for a null body', () => {
    expect(describeFailureBody(null, 'application/json')).toBeNull();
  });

  it('truncates a detail longer than 500 characters', () => {
    const detail = describeFailureBody(JSON.stringify({ message: 'x'.repeat(900) }), 'application/json');
    expect(detail).not.toBeNull();
    expect(detail).toHaveLength(500 + '…(truncated)'.length);
    expect(detail?.endsWith('…(truncated)')).toBe(true);
  });

  it('caps an unparseable body at 200 characters', () => {
    const detail = describeFailureBody('y'.repeat(900), 'text/plain');
    expect(detail).toHaveLength(200);
  });

  it('redacts a sensitive field before printing the body', () => {
    const detail = describeFailureBody('{"accessToken":"secret-value"}', 'application/json');
    expect(detail).not.toContain('secret-value');
  });

  it('redacts a token embedded in an unparseable body', () => {
    // `redactBody` only rewrites recognised JSON fields, so before the
    // `redactText` pass a text/plain error page reached stderr verbatim.
    const detail = describeFailureBody('auth failed for pat=ab2cd3ef4gh5ij6kl7mn8op9qr0st1uv2wx3yz4ab5cd6ef7gh8ij', 'text/plain');
    expect(detail).not.toContain('ab2cd3ef4gh5ij6kl7mn8op9qr0st1uv2wx3yz4ab5cd6ef7gh8ij');
    expect(detail).toContain('[REDACTED]');
  });

  it('redacts a secret that straddles the 200-character cap of an unparseable body', () => {
    // The slice used to happen before `redactText`, so a token whose first
    // characters fell inside the cap survived as an unrecognisable prefix.
    const token = 'ab2cd3ef4gh5ij6kl7mn8op9qr0st1uv2wx3yz4ab5cd6ef7gh8ij';
    const detail = describeFailureBody(`${'upstream error '.repeat(12)}pat=${token}`, 'text/plain');
    expect(detail).not.toBeNull();
    expect(detail).not.toContain(token.slice(0, 20));
    expect(detail).toContain('[REDACTED]');
  });

  it('redacts an Authorization header echoed back inside a plain-text body', () => {
    const detail = describeFailureBody('rejected: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'text/plain');
    expect(detail).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(detail).toContain('[REDACTED]');
  });

  it('redacts a token embedded in an otherwise ordinary JSON message', () => {
    const detail = describeFailureBody('{"message":"token=ab2cd3ef4gh5ij6kl7mn8op9qr0st1uv2wx3yz4ab5cd6ef7gh8ij is invalid"}', 'application/json');
    expect(detail).not.toContain('ab2cd3ef4gh5ij6kl7mn8op9qr0st1uv2wx3yz4ab5cd6ef7gh8ij');
  });

  it('leaves an ordinary long word alone', () => {
    // The opaque-run rule requires both a letter and a digit, so prose and
    // long identifiers are not mistaken for credentials.
    expect(describeFailureBody('{"message":"' + 'x'.repeat(60) + '"}', 'application/json')).toBe('x'.repeat(60));
  });

  it('collapses newlines so the detail stays one console line', () => {
    expect(describeFailureBody('{"message":"line one\\nline two"}', 'application/json')).toBe('line one line two');
  });
});

describe('httpError', () => {
  it('falls back to the bare sentinel for a response the HTTP layer never saw', () => {
    expect(httpError({ status: 503 } as Response).message).toBe('HTTP_503');
  });
});

describe('fetchWithErrors enrichment', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    trace.writer = null;
    vi.restoreAllMocks();
  });

  it('appends the server message to HTTP_<status>', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(500, '{"message":"TF400898: An Internal Error Occurred.","typeKey":"InternalServerError"}'),
    );

    await expect(getOrgFieldNames(ctx, pat)).rejects.toThrow(
      'HTTP_500: TF400898: An Internal Error Occurred. [InternalServerError]',
    );
  });

  it('appends the server message to AUTH_FAILED, keeping the sentinel a prefix', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(401, '{"message":"TF400813: The user is not authorized to access this resource."}'),
    );

    const error = await getWorkItem(ctx, 42, pat).catch((err: Error) => err);
    expect(error.message.startsWith('AUTH_FAILED')).toBe(true);
    expect(error.message).toContain('TF400813');
  });

  it('appends the server message to PERMISSION_DENIED', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(403, '{"message":"TF401019: The Git repository is disabled.","typeKey":"GitRepositoryDisabledException"}'),
    );

    await expect(getWorkItem(ctx, 42, pat)).rejects.toThrow(
      'PERMISSION_DENIED: TF401019: The Git repository is disabled. [GitRepositoryDisabledException]',
    );
  });

  it('never echoes the AAD sign-in page on a 401', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(401, '<!DOCTYPE html><html><body>Sign in</body></html>', 'text/html; charset=utf-8'),
    );

    const error = await getWorkItem(ctx, 42, pat).catch((err: Error) => err);
    expect(error.message).toBe('AUTH_FAILED');
  });

  it('leaves the curated BAD_REQUEST wording in charge of a 400 it already handles', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(400, '{"message":"TF401232: Work item field reference is invalid: Foo.Bar"}'),
    );

    await expect(getWorkItem(ctx, 42, pat, ['Foo.Bar'])).rejects.toThrow(
      'BAD_REQUEST: TF401232: Work item field reference is invalid: Foo.Bar',
    );
  });

  it('enriches a 400 that has no curated handler', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(400, '{"message":"The request is malformed.","typeKey":"BadRequestException"}'),
    );

    await expect(getOrgFieldNames(ctx, pat)).rejects.toThrow(
      'HTTP_400: The request is malformed. [BadRequestException]',
    );
  });

  it('carries typeKey on a curated 400, keeping the BAD_REQUEST prefix', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(400, '{"message":"TF401232: Work item field reference is invalid: Foo.Bar","typeKey":"RuleValidationException"}'),
    );

    await expect(getWorkItem(ctx, 42, pat, ['Foo.Bar'])).rejects.toThrow(
      'BAD_REQUEST: TF401232: Work item field reference is invalid: Foo.Bar [RuleValidationException]',
    );
  });

  it('falls through to HTTP_400 when a curated 400 body names no message', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(400, '{"typeKey":"RuleValidationException"}'));

    await expect(getWorkItem(ctx, 42, pat, ['Foo.Bar'])).rejects.toThrow(
      'HTTP_400: [RuleValidationException]',
    );
  });

  it('redacts a secret in a curated 400 message', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(400, '{"message":"pat=ab2cd3ef4gh5ij6kl7mn8op9qr0st1uv2wx3yz4ab5cd6ef7gh8ij rejected"}'),
    );

    const error = await getWorkItem(ctx, 42, pat, ['Foo.Bar']).catch((err: Error) => err);
    expect(error.message.startsWith('BAD_REQUEST: ')).toBe(true);
    expect(error.message).not.toContain('ab2cd3ef4gh5ij6kl7mn8op9qr0st1uv2wx3yz4ab5cd6ef7gh8ij');
  });

  it('reads a 404 body once and reuses it for the NOT_FOUND message', async () => {
    let reads = 0;
    const body = '{"message":"TF401174: The item does not exist."}';
    const response = {
      ok: false,
      status: 404,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => { reads += 1; return body; },
      json: async () => JSON.parse(body) as unknown,
      clone: () => response,
    } as unknown as Response;
    vi.mocked(fetch).mockResolvedValue(response);

    const error = await getWorkItem(ctx, 42, pat).catch((err: Error) => err);
    expect(error.message).toContain('NOT_FOUND');
    expect(error.message).toContain('TF401174');
    expect(reads).toBe(1);
  });

  it('still captures the detail when tracing is on and the trace clone fails', async () => {
    // A failed trace clone used to be recorded as '', which `readFailureBody`
    // could not tell from a real empty body — so it skipped its own fallback
    // and every failure lost its detail whenever tracing was enabled.
    const appended: unknown[] = [];
    trace.writer = { append: (entry) => { appended.push(entry); } };
    let clones = 0;
    const body = '{"message":"TF400813: The user is not authorized."}';
    const response = {
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => body,
      json: async () => JSON.parse(body) as unknown,
      clone: () => { clones += 1; throw new Error('stream already locked'); },
    } as unknown as Response;
    vi.mocked(fetch).mockResolvedValue(response);

    const error = await getWorkItem(ctx, 42, pat).catch((err: Error) => err);
    expect(clones).toBeGreaterThan(0);
    expect(appended).toHaveLength(1);
    expect(error.message).toBe('AUTH_FAILED: TF400813: The user is not authorized.');
  });

  it('never echoes an HTML body or the raw text on a 404', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(404, '<!DOCTYPE html><html><body>Sign in</body></html>', 'text/html; charset=utf-8'),
    );

    const error = await getWorkItem(ctx, 42, pat).catch((err: Error) => err);
    expect(error.message).toBe('NOT_FOUND');
  });

  it('redacts a secret in the 404 body instead of interpolating it raw', async () => {
    const token = 'ab2cd3ef4gh5ij6kl7mn8op9qr0st1uv2wx3yz4ab5cd6ef7gh8ij';
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(404, `{"message":"no such item for pat=${token}"}`),
    );

    const error = await getWorkItem(ctx, 42, pat).catch((err: Error) => err);
    expect(error.message.startsWith('NOT_FOUND')).toBe(true);
    expect(error.message).not.toContain(token);
    expect(error.message).toContain('[REDACTED]');
  });

  it('leaves the body readable by the caller (the stream is not consumed)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(400, '{"message":"TF401232: Work item field reference is invalid: Foo.Bar"}'),
    );

    // getWorkItem's curated 400 branch reads the body itself, after
    // fetchWithErrors has already read a clone of it for the detail.
    await expect(getWorkItem(ctx, 42, pat, ['Foo.Bar'])).rejects.toThrow('TF401232');
  });
});

// --- command layer: curated guidance first, server detail underneath -------

vi.mock('../../src/services/pr-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/pr-client.js')>();
  return { ...actual, listPullRequests: vi.fn(), getPullRequestThreads: vi.fn() };
});
vi.mock('../../src/services/git-remote.js', () => ({
  detectRepoName: vi.fn(() => 'repo-name'),
  getCurrentBranch: vi.fn(() => 'feature/test'),
}));
vi.mock('../../src/services/auth.js', () => ({
  requireAuthCredential: vi.fn(async () => ({ pat: 'test-pat', source: 'env', kind: 'pat' })),
  describeResolvedCredential: vi.fn(() => null),
}));
vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(() => ({ org: 'test-org', project: 'test-project' })),
}));

import { createPrCommand } from '../../src/commands/pr.js';
import { listPullRequests } from '../../src/services/pr-client.js';
import { getExitCode, getStderr, setupProcessSpies } from './helpers/command-test-utils.js';

function runTree(argv: string[]): Promise<Command> {
  const program = new Command().name('azdo');
  program.addCommand(createPrCommand());
  return program.parseAsync(argv, { from: 'user' });
}

describe('pr error output carries the server detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupProcessSpies();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the curated permission guidance and exit code 4 when a detail is appended', async () => {
    vi.mocked(listPullRequests).mockRejectedValue(
      new Error('PERMISSION_DENIED: TF401019: The Git repository is disabled. [GitRepositoryDisabledException]'),
    );

    await runTree(['pr', 'status']);

    const stderr = getStderr();
    expect(stderr).toContain('Access denied. Your PAT may lack read permissions');
    expect(stderr).toContain('TF401019: The Git repository is disabled.');
    expect(getExitCode()).toBe(4);
  });

  it('keeps the curated auth guidance and exit code 4 when a detail is appended', async () => {
    vi.mocked(listPullRequests).mockRejectedValue(new Error('AUTH_FAILED: TF400813: not authorized'));

    await runTree(['pr', 'status']);

    const stderr = getStderr();
    expect(stderr).toContain('Authentication failed.');
    expect(stderr).toContain('TF400813: not authorized');
    expect(getExitCode()).toBe(4);
  });

  it('keeps the identity-scope guidance and prints the detail underneath it', async () => {
    vi.mocked(listPullRequests).mockRejectedValue(
      new Error('IDENTITY_SCOPE_MISSING: TF400813: The user is not authorized. [UnauthorizedRequestException]'),
    );

    await runTree(['pr', 'status']);

    const stderr = getStderr();
    expect(stderr).toContain('your PAT is missing the "Identity (Read)" scope');
    expect(stderr).toContain('TF400813: The user is not authorized.');
    expect(getExitCode()).toBe(4);
  });

  it('prints the status sentence and the detail separately for an HTTP failure', async () => {
    vi.mocked(listPullRequests).mockRejectedValue(new Error('HTTP_500: TF400898: An Internal Error Occurred.'));

    await runTree(['pr', 'status']);

    const stderr = getStderr();
    expect(stderr).toContain('Azure DevOps request failed with HTTP_500.');
    expect(stderr).toContain('TF400898: An Internal Error Occurred.');
    expect(getExitCode()).toBe(1);
  });
});
