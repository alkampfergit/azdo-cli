import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrStatusCommand } from '../../src/commands/pr.js';
import { createCommandRunner, getExitCode, getStderr, getStdout, setupProcessSpies } from './helpers/command-test-utils.js';

vi.mock('../../src/services/pr-client.js', () => ({
  listPullRequests: vi.fn(),
  getPullRequestChecks: vi.fn(),
}));

vi.mock('../../src/services/git-remote.js', () => ({
  detectRepoName: vi.fn(),
  getCurrentBranch: vi.fn(),
}));

vi.mock('../../src/services/auth.js', () => ({
  requirePat: vi.fn(),
}));

vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(),
}));

import { getPullRequestChecks, listPullRequests } from '../../src/services/pr-client.js';
import { detectRepoName, getCurrentBranch } from '../../src/services/git-remote.js';
import { requirePat } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createPrStatusCommand);
const basePullRequest = {
  id: 12,
  repository: 'repo-name',
  sourceRefName: 'refs/heads/feature/test',
  targetRefName: 'refs/heads/develop',
  createdBy: 'Alice',
  url: 'https://example.test/pr/12',
} as const;

const baseCheck = {
  id: 44,
  state: 'pending',
  name: 'security/sca',
  description: null,
  targetUrl: 'https://example.test/check/44',
  createdBy: 'Azure Pipelines',
  createdAt: '2026-03-31T10:00:00Z',
  updatedAt: '2026-03-31T10:02:00Z',
} as const;

function makePullRequest(overrides: Partial<typeof basePullRequest> & { title: string; status: string }) {
  return {
    ...basePullRequest,
    ...overrides,
  };
}

function makeCheck(overrides: Partial<typeof baseCheck> = {}) {
  return {
    ...baseCheck,
    ...overrides,
  };
}

beforeEach(() => {
  setupProcessSpies();
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(requirePat).mockResolvedValue({ pat: 'test-pat', source: 'env' });
  vi.mocked(detectRepoName).mockReturnValue('repo-name');
  vi.mocked(getCurrentBranch).mockReturnValue('feature/test');
  vi.mocked(listPullRequests).mockResolvedValue([]);
  vi.mocked(getPullRequestChecks).mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pr status command', () => {
  it('prints a no-results message when no pull requests exist', async () => {
    await run([]);
    expect(getStdout()).toContain('No pull requests found for branch feature/test.');
  });

  it('prints a single pull request in text mode', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([makePullRequest({ title: 'Test PR', status: 'active' })]);
    vi.mocked(getPullRequestChecks).mockResolvedValue([makeCheck()]);

    await run([]);

    const output = getStdout();
    expect(output).toContain('#12 [active] Test PR');
    expect(output).toContain('feature/test -> develop');
    expect(output).toContain('https://example.test/pr/12');
    expect(output).toContain('Checks:');
    expect(output).toContain('- [pending] security/sca');
  });

  it('prints multiple pull requests in text mode', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([
      {
        ...makePullRequest({ title: 'Active PR', status: 'active' }),
      },
      {
        ...makePullRequest({
          title: 'Completed PR',
          status: 'completed',
          targetRefName: 'refs/heads/main',
        }),
        id: 13,
        url: 'https://example.test/pr/13',
      },
    ]);
    vi.mocked(getPullRequestChecks)
      .mockResolvedValueOnce([makeCheck({ state: 'succeeded', name: 'ci/build' })])
      .mockResolvedValueOnce([]);

    await run([]);

    const output = getStdout();
    expect(output).toContain('#12 [active] Active PR');
    expect(output).toContain('#13 [completed] Completed PR');
    expect(output).toContain('- [succeeded] ci/build');
    expect(output).toContain('Checks: none reported by Azure DevOps');
  });

  it('prints failed check details when available', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([makePullRequest({ title: 'Test PR', status: 'active' })]);
    vi.mocked(getPullRequestChecks).mockResolvedValue([
      makeCheck({
        state: 'failed',
        name: 'quality/unit-tests',
        description: 'Test run 144 failed in stage unit',
      }),
    ]);

    await run([]);

    const output = getStdout();
    expect(output).toContain('- [failed] quality/unit-tests');
    expect(output).toContain('Detail: Test run 144 failed in stage unit');
  });

  it('prints JSON output with --json', async () => {
    const pullRequest = makePullRequest({ title: 'Test PR', status: 'active' });
    vi.mocked(listPullRequests).mockResolvedValue([pullRequest]);
    vi.mocked(getPullRequestChecks).mockResolvedValue([makeCheck()]);

    await run(['--json']);

    expect(JSON.parse(getStdout())).toEqual({
      branch: 'feature/test',
      repository: 'repo-name',
      pullRequests: [
        {
          ...pullRequest,
          checks: [makeCheck()],
        },
      ],
    });
  });

  it('prints an authentication error and exits with code 1', async () => {
    vi.mocked(listPullRequests).mockRejectedValue(new Error('AUTH_FAILED'));
    await run([]);
    expect(getStderr()).toContain('Authentication failed');
    expect(getExitCode()).toBe(1);
  });

  it('fails when Azure DevOps check lookup fails', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([makePullRequest({ title: 'Test PR', status: 'active' })]);
    vi.mocked(getPullRequestChecks).mockRejectedValue(new Error('HTTP_500'));

    await run([]);

    expect(getStderr()).toContain('Azure DevOps request failed with HTTP_500.');
    expect(getExitCode()).toBe(1);
  });

  it('prints a detached HEAD error and exits with code 1', async () => {
    vi.mocked(getCurrentBranch).mockImplementation(() => {
      throw new Error('Not on a named branch. Check out a named branch and try again.');
    });
    await run([]);
    expect(getStderr()).toContain('Not on a named branch. Check out a named branch and try again.');
    expect(getExitCode()).toBe(1);
  });
});
