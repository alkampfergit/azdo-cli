import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPrCommentResolveCommand,
  createPrCommentReopenCommand,
} from '../../src/commands/pr.js';
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
    getPullRequestThreads: vi.fn(),
    getPullRequestById: vi.fn(),
    patchThreadStatus: vi.fn(),
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

import {
  getPullRequestById,
  getPullRequestThreads,
  listPullRequests,
  patchThreadStatus,
} from '../../src/services/pr-client.js';
import { detectRepoName, getCurrentBranch } from '../../src/services/git-remote.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const runResolve = createCommandRunner(createPrCommentResolveCommand);
const runReopen = createCommandRunner(createPrCommentReopenCommand);

const referencePr = {
  id: 64,
  title: 'Reference PR',
  repository: 'repo-name',
  sourceRefName: 'refs/heads/feature/other',
  targetRefName: 'refs/heads/develop',
  status: 'active',
  createdBy: 'Alice',
  url: 'https://example.test/pr/64',
};

function thread(id: number, status: string) {
  return {
    id,
    status,
    threadContext: null,
    line: null,
    comments: [{ id: id * 10, author: 'Alice', content: 'note', publishedAt: null }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setupProcessSpies();
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(detectRepoName).mockReturnValue('repo-name');
  vi.mocked(getCurrentBranch).mockReturnValue('feature/test');
  vi.mocked(listPullRequests).mockResolvedValue([referencePr]);
  vi.mocked(getPullRequestById).mockResolvedValue(referencePr);
  vi.mocked(patchThreadStatus).mockImplementation(async (_ctx, _repo, _pat, _prId, tid, status) => thread(tid, status));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pr comment-resolve command', () => {
  it.each([['abc'], ['-1'], ['0'], ['3.14'], [' 17']])(
    'rejects invalid thread id %s with exit 1 and no crash',
    async (raw) => {
      await runResolve([raw, '--pr-number', '64']);
      expect(getStderr()).toContain(`Invalid thread id "${raw}"`);
      expect(getExitCode()).toBe(1);
    },
  );

  it('resolves an active thread — PATCHes fixed, prints confirmation, exits 0', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([thread(17, 'active')]);

    await runResolve(['17', '--pr-number', '64']);

    expect(vi.mocked(patchThreadStatus)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.objectContaining({ pat: 'test-pat' }), 64, 17, 'fixed',
    );
    expect(getStdout()).toContain('Thread #17 resolved on pull request #64');
    expect(getExitCode()).toBe(0);
  });

  it('is idempotent when thread is already resolved (exit 0, noop:true, no PATCH)', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([thread(17, 'fixed')]);

    await runResolve(['17', '--pr-number', '64', '--json']);

    expect(vi.mocked(patchThreadStatus)).not.toHaveBeenCalled();
    expect(JSON.parse(getStdout())).toEqual({
      pullRequestId: 64,
      threadId: 17,
      status: 'fixed',
      noop: true,
    });
    expect(getExitCode()).toBe(0);
  });

  it('treats every settled backend state as "already resolved" and surfaces the actual backend status in --json noop output', async () => {
    for (const settled of ['wontFix', 'closed', 'byDesign']) {
      vi.clearAllMocks();
      setupProcessSpies();
      vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
      vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
      vi.mocked(detectRepoName).mockReturnValue('repo-name');
      vi.mocked(getCurrentBranch).mockReturnValue('feature/test');
      vi.mocked(getPullRequestById).mockResolvedValue(referencePr);
      vi.mocked(getPullRequestThreads).mockResolvedValue([thread(17, settled)]);

      await runResolve(['17', '--pr-number', '64', '--json']);

      expect(vi.mocked(patchThreadStatus)).not.toHaveBeenCalled();
      const payload = JSON.parse(getStdout());
      expect(payload).toEqual({
        pullRequestId: 64,
        threadId: 17,
        // The actual backend status MUST surface here, not the nominal
        // target ("fixed"), so --json consumers can branch on e.g. wontFix.
        status: settled,
        noop: true,
      });
      expect(getExitCode()).toBe(0);
    }
  });

  it('reports "thread not found" when the id is absent from the PR', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([thread(99, 'active')]);

    await runResolve(['17', '--pr-number', '64']);

    expect(vi.mocked(patchThreadStatus)).not.toHaveBeenCalled();
    expect(getStderr()).toContain('Thread #17 not found on pull request #64');
    // 3 = addressed resource not found (see the exit-code contract in pr.ts).
    expect(getExitCode()).toBe(3);
  });

  it('rejects invalid --pr-number without crashing', async () => {
    await runResolve(['17', '--pr-number', 'abc']);
    expect(getStderr()).toContain('Invalid --pr-number "abc"');
    expect(getExitCode()).toBe(1);
  });
});

describe('pr comment-reopen command', () => {
  it('reopens a resolved thread — PATCHes active, prints confirmation, exits 0', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([thread(17, 'fixed')]);

    await runReopen(['17', '--pr-number', '64']);

    expect(vi.mocked(patchThreadStatus)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.objectContaining({ pat: 'test-pat' }), 64, 17, 'active',
    );
    expect(getStdout()).toContain('Thread #17 reopened on pull request #64');
    expect(getExitCode()).toBe(0);
  });

  it('is idempotent when thread is already active (exit 0, noop:true, no PATCH)', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([thread(17, 'active')]);

    await runReopen(['17', '--pr-number', '64', '--json']);

    expect(vi.mocked(patchThreadStatus)).not.toHaveBeenCalled();
    expect(JSON.parse(getStdout())).toEqual({
      pullRequestId: 64,
      threadId: 17,
      status: 'active',
      noop: true,
    });
    expect(getExitCode()).toBe(0);
  });

  it('treats "pending" as already-open (no PATCH) and surfaces the pending status in --json', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([thread(17, 'pending')]);

    await runReopen(['17', '--pr-number', '64', '--json']);

    expect(vi.mocked(patchThreadStatus)).not.toHaveBeenCalled();
    expect(JSON.parse(getStdout())).toEqual({
      pullRequestId: 64,
      threadId: 17,
      status: 'pending',
      noop: true,
    });
    expect(getExitCode()).toBe(0);
  });
});
