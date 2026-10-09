import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrListCommand } from '../../src/commands/pr.js';
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
    listRepositoryPullRequests: vi.fn(),
    getPullRequestWorkItemIds: vi.fn(),
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

import { getPullRequestWorkItemIds, listRepositoryPullRequests } from '../../src/services/pr-client.js';
import { detectRepoName, getCurrentBranch } from '../../src/services/git-remote.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createPrListCommand);

const pullRequest = {
  id: 4804,
  title: 'Multiple orders',
  repository: 'repo-name',
  sourceRefName: 'refs/heads/feature/19384_multiple_orders',
  targetRefName: 'refs/heads/develop',
  status: 'active',
  createdBy: 'Alice',
  url: 'https://example.test/pr/4804',
  description: 'Adds multi-order support.',
};

beforeEach(() => {
  vi.clearAllMocks();
  setupProcessSpies();
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(detectRepoName).mockReturnValue('repo-name');
  vi.mocked(getCurrentBranch).mockReturnValue('feature/test');
  vi.mocked(listRepositoryPullRequests).mockResolvedValue([pullRequest]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pr list command', () => {
  it('lists active pull requests of the repository by default, without touching the current branch', async () => {
    await run([]);

    expect(vi.mocked(getCurrentBranch)).not.toHaveBeenCalled();
    expect(vi.mocked(listRepositoryPullRequests)).toHaveBeenCalledWith(
      expect.any(Object),
      'repo-name',
      expect.objectContaining({ pat: 'test-pat' }),
      { sourceBranch: undefined, status: 'active', top: 25 },
    );
    const output = getStdout();
    expect(output).toContain('#4804 [active] Multiple orders');
    expect(output).toContain('feature/19384_multiple_orders -> develop');
    expect(output).toContain('Author: Alice');
    expect(output).toContain('https://example.test/pr/4804');
    expect(getExitCode()).toBe(0);
  });

  it('filters by source branch and strips a refs/heads/ prefix', async () => {
    await run(['--branch', 'refs/heads/feature/19384_multiple_orders']);

    expect(vi.mocked(listRepositoryPullRequests)).toHaveBeenCalledWith(
      expect.any(Object),
      'repo-name',
      expect.any(Object),
      { sourceBranch: 'feature/19384_multiple_orders', status: 'active', top: 25 },
    );
  });

  it.each([['completed'], ['abandoned'], ['all']])('accepts --status %s', async (status) => {
    await run(['--status', status]);

    expect(vi.mocked(listRepositoryPullRequests)).toHaveBeenCalledWith(
      expect.any(Object),
      'repo-name',
      expect.any(Object),
      expect.objectContaining({ status }),
    );
  });

  it('rejects an unknown --status', async () => {
    await run(['--status', 'merged']);

    expect(vi.mocked(listRepositoryPullRequests)).not.toHaveBeenCalled();
    expect(getStderr()).toContain('Invalid --status "merged"; expected one of active, completed, abandoned, all.');
    expect(getExitCode()).toBe(1);
  });

  it.each([['0'], ['-1'], ['abc'], ['2.5']])('rejects invalid --top %s', async (raw) => {
    await run(['--top', raw]);

    expect(vi.mocked(listRepositoryPullRequests)).not.toHaveBeenCalled();
    expect(getStderr()).toContain(`Invalid --top "${raw}"`);
    expect(getExitCode()).toBe(1);
  });

  it('honours --repo instead of the origin remote', async () => {
    await run(['--repo', 'other-repo']);

    expect(vi.mocked(detectRepoName)).not.toHaveBeenCalled();
    expect(vi.mocked(listRepositoryPullRequests)).toHaveBeenCalledWith(
      expect.any(Object),
      'other-repo',
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('prints a clear message when nothing matches', async () => {
    vi.mocked(listRepositoryPullRequests).mockResolvedValue([]);

    await run(['--branch', 'feature/unknown']);

    expect(getStdout()).toContain('No active pull request found in repo-name for branch feature/unknown.');
    expect(getExitCode()).toBe(0);
  });

  it('emits the branch filter, status and PRs in --json', async () => {
    await run(['--branch', 'feature/19384_multiple_orders', '--json']);

    expect(JSON.parse(getStdout())).toEqual({
      repository: 'repo-name',
      branch: 'feature/19384_multiple_orders',
      status: 'active',
      pullRequests: [pullRequest],
    });
  });

  it('maps a read auth failure to the Code (Read) scope hint', async () => {
    vi.mocked(listRepositoryPullRequests).mockRejectedValue(new Error('AUTH_FAILED'));

    await run([]);

    expect(getStderr()).toContain('Code (Read)');
    expect(getExitCode()).toBe(4);
  });

  describe('--work-items (#122)', () => {
    const second = { ...pullRequest, id: 4805, title: 'Second', isDraft: true };

    beforeEach(() => {
      vi.mocked(listRepositoryPullRequests).mockResolvedValue([pullRequest, second]);
      vi.mocked(getPullRequestWorkItemIds).mockImplementation(async (_c, _r, _p, prId) => (prId === 4804 ? [11, 12] : []));
    });

    it('does not look up work items without the flag', async () => {
      await run(['--json']);

      expect(vi.mocked(getPullRequestWorkItemIds)).not.toHaveBeenCalled();
      expect(JSON.parse(getStdout()).pullRequests[0]).not.toHaveProperty('workItemIds');
    });

    it('adds workItemIds to every pull request in --json, preserving order', async () => {
      await run(['--work-items', '--json']);

      expect(vi.mocked(getPullRequestWorkItemIds)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(getPullRequestWorkItemIds)).toHaveBeenCalledWith(
        expect.any(Object),
        'repo-name',
        expect.objectContaining({ pat: 'test-pat' }),
        4804,
      );
      const parsed = JSON.parse(getStdout());
      expect(parsed.pullRequests).toEqual([
        { ...pullRequest, workItemIds: [11, 12] },
        { ...second, workItemIds: [] },
      ]);
    });

    it('prints the linked work items and the draft marker in text output', async () => {
      await run(['--work-items']);

      const output = getStdout();
      expect(output).toContain('Work items: #11, #12');
      expect(output).toContain('Work items: none');
      expect(output).toContain('#4805 [active, draft] Second');
      expect(output).toContain('#4804 [active] Multiple orders');
    });

    it('caps concurrent work item lookups', async () => {
      const many = Array.from({ length: 12 }, (_, index) => ({ ...pullRequest, id: 5000 + index }));
      vi.mocked(listRepositoryPullRequests).mockResolvedValue(many);
      let inFlight = 0;
      let peak = 0;
      vi.mocked(getPullRequestWorkItemIds).mockImplementation(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return [];
      });

      await run(['--work-items', '--json']);

      expect(vi.mocked(getPullRequestWorkItemIds)).toHaveBeenCalledTimes(12);
      expect(peak).toBeLessThanOrEqual(5);
      expect(JSON.parse(getStdout()).pullRequests.map((pr: { id: number }) => pr.id)).toEqual(many.map((pr) => pr.id));
    });

    it('maps a work item lookup auth failure to the Code (Read) scope hint', async () => {
      vi.mocked(getPullRequestWorkItemIds).mockRejectedValue(new Error('AUTH_FAILED'));

      await run(['--work-items', '--json']);

      expect(getStdout()).toBe('');
      expect(getStderr()).toContain('Code (Read)');
      expect(getExitCode()).toBe(4);
    });
  });
});
