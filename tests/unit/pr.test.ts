import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPrCommentsCommand,
  createPrCommentResolveCommand,
  createPrCommentReopenCommand,
  createPrStatusCommand,
} from '../../src/commands/pr.js';
import { createCommandRunner, getExitCode, getStderr, getStdout, setupProcessSpies } from './helpers/command-test-utils.js';

// US2 (019-fix-pr-command) command-surface contracts C-1 / C-2 / C-3.
//
// Scope per owner decision A on PR #43: `pr status` stays a multi-PR list
// command — it is intentionally EXCLUDED from the --pr-number help sentence
// (C-1) and from the zero/multi-match error contracts (C-2/C-3). Only the
// three single-PR commands (`comments`, `comment-resolve`, `comment-reopen`)
// carry them.

vi.mock('../../src/services/pr-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/pr-client.js')>();
  return {
    ...actual,
    listPullRequests: vi.fn(),
    getPullRequestThreads: vi.fn(),
    getPullRequestById: vi.fn(),
    getPullRequestChecks: vi.fn(),
    patchThreadStatus: vi.fn(),
  };
});

vi.mock('../../src/services/git-remote.js', () => ({
  detectRepoName: vi.fn(),
  getCurrentBranch: vi.fn(),
}));

vi.mock('../../src/services/auth.js', () => ({
  requireAuthCredential: vi.fn(),
}));

vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(),
}));

import { listPullRequests } from '../../src/services/pr-client.js';
import { detectRepoName, getCurrentBranch } from '../../src/services/git-remote.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const C1_SUBSTRING = 'pull request whose source branch equals refs/heads/<current branch>';

beforeEach(() => {
  vi.clearAllMocks();
  setupProcessSpies();
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(detectRepoName).mockReturnValue('repo-name');
  vi.mocked(getCurrentBranch).mockReturnValue('feature/test');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('C-1 — --pr-number help sentence (single-PR commands)', () => {
  it.each([
    ['comments', createPrCommentsCommand],
    ['comment-resolve', createPrCommentResolveCommand],
    ['comment-reopen', createPrCommentReopenCommand],
  ])('pr %s --help documents the branch->PR auto-detection rule', async (_name, factory) => {
    const run = createCommandRunner(factory);
    await run(['--help']);
    expect(getStdout()).toContain(C1_SUBSTRING);
  });

  it('pr status --help does NOT carry the sentence (decision A keeps it a list)', async () => {
    const run = createCommandRunner(createPrStatusCommand);
    await run(['--help']);
    expect(getStdout()).not.toContain(C1_SUBSTRING);
  });
});

const basePullRequest = {
  id: 12,
  title: 'PR 1',
  repository: 'repo-name',
  sourceRefName: 'refs/heads/feature/test',
  targetRefName: 'refs/heads/develop',
  status: 'active',
  createdBy: 'Alice',
  url: 'https://example.test/pr/12',
} as const;

function prWith(id: number): typeof basePullRequest {
  return { ...basePullRequest, id, url: `https://example.test/pr/${id}` };
}

describe('C-2 — zero-match error', () => {
  it('pr comments: exact stderr line, exit 1, empty stdout', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([]);
    const run = createCommandRunner(createPrCommentsCommand);
    await run([]);
    expect(getStderr()).toBe(
      'No open pull request matches branch feature/test. Pass --pr-number to target a specific PR, or push the branch and open a pull request.\n',
    );
    expect(getStdout()).toBe('');
    expect(getExitCode()).toBe(1);
  });

  it('pr comment-resolve: same exact zero-match contract', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([]);
    const run = createCommandRunner(createPrCommentResolveCommand);
    await run(['17']);
    expect(getStderr()).toBe(
      'No open pull request matches branch feature/test. Pass --pr-number to target a specific PR, or push the branch and open a pull request.\n',
    );
    expect(getStdout()).toBe('');
    expect(getExitCode()).toBe(1);
  });
});

describe('C-3 — multi-match error', () => {
  it('pr comments: #-prefixed, comma-space, API order, exit 1, empty stdout, no prompt', async () => {
    // Deliberately out of numeric order to prove the CLI does not re-sort.
    vi.mocked(listPullRequests).mockResolvedValue([prWith(13), prWith(12), prWith(7)]);
    const originalIsTTY = process.stdout.isTTY;
    (process.stdout as { isTTY?: boolean }).isTTY = true;
    try {
      const run = createCommandRunner(createPrCommentsCommand);
      await run([]);
      expect(getStderr()).toBe(
        'Multiple open pull requests match branch feature/test: #13, #12, #7. Re-run with --pr-number to choose.\n',
      );
      expect(getStdout()).toBe('');
      expect(getExitCode()).toBe(1);
    } finally {
      (process.stdout as { isTTY?: boolean }).isTTY = originalIsTTY;
    }
  });

  it('pr comment-reopen: same exact multi-match contract', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([prWith(12), prWith(13)]);
    const run = createCommandRunner(createPrCommentReopenCommand);
    await run(['17']);
    expect(getStderr()).toBe(
      'Multiple open pull requests match branch feature/test: #12, #13. Re-run with --pr-number to choose.\n',
    );
    expect(getStdout()).toBe('');
    expect(getExitCode()).toBe(1);
  });
});
