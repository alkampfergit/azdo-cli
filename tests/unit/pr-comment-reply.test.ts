import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrCommentReplyCommand, createPrCommentsReplyCommand } from '../../src/commands/pr.js';
import {
  createCommandRunner,
  getExitCode,
  getStderr,
  getStdout,
  setupProcessSpies,
} from './helpers/command-test-utils.js';

vi.mock('../../src/services/pr-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/pr-client.js')>();
  return {
    ...actual,
    listPullRequests: vi.fn(),
    getPullRequestById: vi.fn(),
    getPullRequestThreads: vi.fn(),
    postThreadComment: vi.fn(),
  };
});

vi.mock('../../src/services/git-remote.js', () => ({
  detectRepoName: vi.fn(),
  getCurrentBranch: vi.fn(),
}));

vi.mock('../../src/services/auth.js', () => ({
  requireAuthCredential: vi.fn(),
  describeResolvedCredential: vi.fn(() => null),
}));

vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(),
}));

// `--file -` resolves to a synchronous read of file descriptor 0. There is no
// way to swap the test runner's own stdin, so the read itself is the thing
// asserted: the command must ask node:fs for fd 0, not for a file named "-".
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

import { readFileSync } from 'node:fs';

const { readFileSync: realReadFileSync } = await vi.importActual<typeof import('node:fs')>('node:fs');

import {
  getPullRequestById,
  getPullRequestThreads,
  listPullRequests,
  postThreadComment,
} from '../../src/services/pr-client.js';
import { detectRepoName, getCurrentBranch } from '../../src/services/git-remote.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createPrCommentsReplyCommand);
const runAlias = createCommandRunner(createPrCommentReplyCommand);

const referencePr = {
  id: 64,
  title: 'Reference PR',
  repository: 'repo-name',
  sourceRefName: 'refs/heads/feature/other',
  targetRefName: 'refs/heads/develop',
  status: 'active',
  createdBy: 'Alice',
  url: 'https://example.test/pr/64',
  description: null,
};

let tempDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  setupProcessSpies();
  tempDir = mkdtempSync(join(tmpdir(), 'azdo-pr-reply-'));
  // The stdin case below swaps this out; re-arm the real reader every test so
  // the swap cannot leak into the file-reading cases.
  vi.mocked(readFileSync).mockImplementation(realReadFileSync as never);
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(detectRepoName).mockReturnValue('repo-name');
  vi.mocked(getCurrentBranch).mockReturnValue('feature/test');
  vi.mocked(listPullRequests).mockResolvedValue([referencePr]);
  vi.mocked(getPullRequestById).mockResolvedValue(referencePr);
  vi.mocked(getPullRequestThreads).mockResolvedValue([
    { id: 148, status: 'active', threadContext: null, line: null, comments: [] },
  ]);
  vi.mocked(postThreadComment).mockResolvedValue({
    id: 9,
    author: 'Alice',
    content: 'replied',
    publishedAt: null,
  });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('pr comments reply', () => {
  it('posts the inline reply text', async () => {
    await run(['148', 'Great suggestion', '--pr-number', '64']);

    expect(vi.mocked(postThreadComment)).toHaveBeenCalledWith(
      expect.any(Object),
      'repo-name',
      expect.objectContaining({ pat: 'test-pat' }),
      64,
      148,
      'Great suggestion',
    );
    expect(getStdout()).toContain('Reply posted to thread #148 on pull request #64.');
    expect(getExitCode()).toBe(0);
  });

  it('reads the reply body from --file', async () => {
    const file = join(tempDir, 'reply.md');
    writeFileSync(file, 'Answer from a file.\n', 'utf-8');

    await run(['148', '--file', file, '--pr-number', '64']);

    expect(vi.mocked(postThreadComment)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 64, 148, 'Answer from a file.',
    );
  });

  it('reads the reply body from standard input when --file is "-" (038)', async () => {
    vi.mocked(readFileSync).mockImplementation(((target: unknown, encoding: unknown) => (
      target === 0 ? 'Piped answer.\n' : realReadFileSync(target as never, encoding as never)
    )) as never);

    await run(['148', '--file', '-', '--pr-number', '64']);

    expect(vi.mocked(readFileSync)).toHaveBeenCalledWith(0, 'utf-8');
    expect(vi.mocked(postThreadComment)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 64, 148, 'Piped answer.',
    );
  });

  it('keeps the 029 wording when no body is supplied', async () => {
    await run(['148', '--pr-number', '64']);

    expect(vi.mocked(postThreadComment)).not.toHaveBeenCalled();
    expect(getStderr()).toContain('Reply text must not be empty.');
    expect(getExitCode()).toBe(1);
  });

  it('rejects inline text together with --file', async () => {
    const file = join(tempDir, 'reply.md');
    writeFileSync(file, 'body', 'utf-8');

    await run(['148', 'inline', '--file', file, '--pr-number', '64']);

    expect(getStderr()).toContain('Cannot specify both inline text and --file.');
    expect(getExitCode()).toBe(1);
  });

  it('fails when the thread is not on the pull request', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([]);

    await run(['148', 'text', '--pr-number', '64']);

    expect(getStderr()).toContain('Thread #148 not found on pull request #64.');
    expect(getExitCode()).toBe(3);
  });

  it('honours --repo instead of the origin remote', async () => {
    await run(['148', 'text', '--pr-number', '64', '--repo', 'other-repo']);

    expect(vi.mocked(detectRepoName)).not.toHaveBeenCalled();
    expect(vi.mocked(postThreadComment)).toHaveBeenCalledWith(
      expect.any(Object), 'other-repo', expect.any(Object), 64, 148, 'text',
    );
  });

  it('the comment-reply alias behaves identically', async () => {
    await runAlias(['148', 'text', '--pr-number', '64']);

    expect(getStdout()).toContain('Reply posted to thread #148 on pull request #64.');
  });
});
