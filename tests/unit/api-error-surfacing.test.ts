import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import {
  describeFailureBody,
  getOrgFieldNames,
  getWorkItem,
  httpError,
} from '../../src/services/azdo-client.js';
import { testContext as ctx, testPat as pat } from './helpers/api-test-utils.js';

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

  it('prints the status sentence and the detail separately for an HTTP failure', async () => {
    vi.mocked(listPullRequests).mockRejectedValue(new Error('HTTP_500: TF400898: An Internal Error Occurred.'));

    await runTree(['pr', 'status']);

    const stderr = getStderr();
    expect(stderr).toContain('Azure DevOps request failed with HTTP_500.');
    expect(stderr).toContain('TF400898: An Internal Error Occurred.');
    expect(getExitCode()).toBe(1);
  });
});
