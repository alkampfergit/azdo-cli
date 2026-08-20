import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { createPrCommand } from '../../src/commands/pr.js';
import { getExitCode, getStderr, setupProcessSpies } from './helpers/command-test-utils.js';

vi.mock('../../src/services/pr-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/pr-client.js')>();
  return {
    ...actual,
    listPullRequests: vi.fn(),
    getPullRequestById: vi.fn(),
    getPullRequestThread: vi.fn(),
    getPullRequestThreads: vi.fn(),
    createPullRequestThread: vi.fn(),
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

vi.mock('../../src/services/context.js', () => ({ resolveContext: vi.fn() }));

import {
  createPullRequestThread,
  getPullRequestById,
  getPullRequestThreads,
  listPullRequests,
} from '../../src/services/pr-client.js';
import { detectRepoName, getCurrentBranch } from '../../src/services/git-remote.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

// The exit-code contract exists so a caller can branch on "not permitted" vs
// "not found" without scraping stderr:
//   1 validation / other, 3 addressed resource missing, 4 not permitted.
function runTree(argv: string[]): Promise<Command> {
  const program = new Command().name('azdo');
  program.addCommand(createPrCommand());
  return program.parseAsync(argv, { from: 'user' });
}

const pr = {
  id: 64,
  title: 'PR',
  repository: 'repo-name',
  sourceRefName: 'refs/heads/feature/test',
  targetRefName: 'refs/heads/develop',
  status: 'active',
  createdBy: 'Alice',
  url: 'https://example.test/pr/64',
  description: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  setupProcessSpies();
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(detectRepoName).mockReturnValue('repo-name');
  vi.mocked(getCurrentBranch).mockReturnValue('feature/test');
  vi.mocked(listPullRequests).mockResolvedValue([pr]);
  vi.mocked(getPullRequestById).mockResolvedValue(pr);
  vi.mocked(getPullRequestThreads).mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pr exit-code contract', () => {
  it('exits 3 when the pull request addressed by --pr-number does not exist', async () => {
    vi.mocked(getPullRequestById).mockRejectedValue(new Error('NOT_FOUND: pull request'));

    await runTree(['pr', 'comments', '--pr-number', '999']);

    expect(getStderr()).toContain('Pull request #999 not found');
    expect(getExitCode()).toBe(3);
  });

  it('exits 3 when the addressed thread does not exist', async () => {
    await runTree(['pr', 'comments', 'reply', '148', 'text', '--pr-number', '64']);

    expect(getStderr()).toContain('Thread #148 not found on pull request #64.');
    expect(getExitCode()).toBe(3);
  });

  it.each([
    ['AUTH_FAILED', 'Authentication failed'],
    ['PERMISSION_DENIED', 'Access denied'],
  ])('exits 4 on %s (not permitted)', async (code, expectedText) => {
    vi.mocked(createPullRequestThread).mockRejectedValue(new Error(code));

    await runTree(['pr', 'comments', 'add', 'body', '--pr-number', '64']);

    expect(getStderr()).toContain(expectedText);
    expect(getExitCode()).toBe(4);
  });

  it('exits 1 on a validation failure', async () => {
    await runTree(['pr', 'comments', 'add', 'body', '--pr-number', 'abc']);

    expect(getStderr()).toContain('Invalid --pr-number "abc"');
    expect(getExitCode()).toBe(1);
  });

  it('exits 1 on a network failure (retryable, not a missing resource)', async () => {
    vi.mocked(createPullRequestThread).mockRejectedValue(new Error('NETWORK_ERROR'));

    await runTree(['pr', 'comments', 'add', 'body', '--pr-number', '64']);

    expect(getStderr()).toContain('Could not connect to Azure DevOps');
    expect(getExitCode()).toBe(1);
  });

  it('keeps exit 1 for the branch auto-detection zero-match (contract C-2 of 019)', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([]);

    await runTree(['pr', 'comments', 'add', 'body']);

    expect(getStderr()).toContain('No open pull request matches branch feature/test.');
    expect(getExitCode()).toBe(1);
  });
});
