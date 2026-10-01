import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrStatusCommand } from '../../src/commands/pr.js';
import { createCommandRunner, getExitCode, getStderr, getStdout, setupProcessSpies } from './helpers/command-test-utils.js';

vi.mock('../../src/services/pr-client.js', () => ({
  listPullRequests: vi.fn(),
  getPullRequestById: vi.fn(),
  getPullRequestChecks: vi.fn(),
  getPullRequestPolicyEvaluations: vi.fn(),
  getPullRequestBuilds: vi.fn(),
  resolveProjectId: vi.fn(),
  getPullRequestThreads: vi.fn(),
  isThreadResolved: (status: string) =>
    new Set(['fixed', 'wontFix', 'closed', 'byDesign']).has(status),
}));

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
  getPullRequestBuilds,
  getPullRequestById,
  getPullRequestChecks,
  getPullRequestPolicyEvaluations,
  getPullRequestThreads,
  listPullRequests,
  resolveProjectId,
} from '../../src/services/pr-client.js';
import { detectRepoName, getCurrentBranch } from '../../src/services/git-remote.js';
import { requireAuthCredential } from '../../src/services/auth.js';
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
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(detectRepoName).mockReturnValue('repo-name');
  vi.mocked(getCurrentBranch).mockReturnValue('feature/test');
  vi.mocked(listPullRequests).mockResolvedValue([]);
  vi.mocked(getPullRequestChecks).mockResolvedValue([]);
  vi.mocked(resolveProjectId).mockResolvedValue('project-guid');
  vi.mocked(getPullRequestPolicyEvaluations).mockResolvedValue([]);
  vi.mocked(getPullRequestBuilds).mockResolvedValue([]);
  vi.mocked(getPullRequestThreads).mockResolvedValue([]);
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
          codeCommentCounts: { open: 0, closed: 0 },
          checksError: null,
        },
      ],
    });
  });

  it('prints an authentication error and exits with code 4 (not permitted)', async () => {
    vi.mocked(listPullRequests).mockRejectedValue(new Error('AUTH_FAILED'));
    await run([]);
    expect(getStderr()).toContain('Authentication failed');
    expect(getExitCode()).toBe(4);
  });

  it('reports checks as unavailable (not "none") when both check sources fail, without aborting', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([makePullRequest({ title: 'Test PR', status: 'active' })]);
    vi.mocked(getPullRequestChecks).mockRejectedValue(new Error('HTTP_500'));
    vi.mocked(getPullRequestPolicyEvaluations).mockRejectedValue(new Error('HTTP_500'));

    await run([]);

    const output = getStdout();
    expect(output).toContain('#12 [active] Test PR');
    expect(output).toContain('Checks: unable to retrieve');
    expect(output).not.toContain('none reported');
    expect(getExitCode()).toBe(0);
  });

  it('prints a detached HEAD error and exits with code 1', async () => {
    vi.mocked(getCurrentBranch).mockImplementation(() => {
      throw new Error('Not on a named branch. Check out a named branch and try again.');
    });
    await run([]);
    expect(getStderr()).toContain('Not on a named branch. Check out a named branch and try again.');
    expect(getExitCode()).toBe(1);
  });

  // US1 — merge branch policy evaluations with status-API checks (#50)
  it('lists branch policy evaluation checks alongside status checks', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([makePullRequest({ title: 'Test PR', status: 'active' })]);
    vi.mocked(getPullRequestChecks).mockResolvedValue([]);
    vi.mocked(getPullRequestPolicyEvaluations).mockResolvedValue([
      {
        id: 10,
        state: 'succeeded',
        name: 'Build validation',
        description: null,
        targetUrl: null,
        createdBy: null,
        createdAt: null,
        updatedAt: null,
        source: 'policy',
      },
    ]);

    await run([]);

    const output = getStdout();
    expect(output).toContain('Checks:');
    expect(output).toContain('- [succeeded] Build validation');
    expect(output).not.toContain('none reported');
  });

  // US3 — open/closed code-comment counts (#50)
  it('prints open/closed counts of code-anchored comments, excluding general threads', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([makePullRequest({ title: 'Test PR', status: 'active' })]);
    vi.mocked(getPullRequestThreads).mockResolvedValue([
      { id: 1, status: 'active', threadContext: 'src/a.ts', line: null, comments: [] },
      { id: 2, status: 'active', threadContext: 'src/b.ts', line: null, comments: [] },
      { id: 3, status: 'fixed', threadContext: 'src/c.ts', line: null, comments: [] },
      { id: 4, status: 'active', threadContext: null, line: null, comments: [] }, // general — excluded
    ]);

    await run([]);

    expect(getStdout()).toContain('Code comments: 2 open, 1 closed');
  });

  it('reports zero code-comment counts when there are no code-anchored threads', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([makePullRequest({ title: 'Test PR', status: 'active' })]);
    vi.mocked(getPullRequestThreads).mockResolvedValue([
      { id: 4, status: 'active', threadContext: null, line: null, comments: [] },
    ]);

    await run([]);

    expect(getStdout()).toContain('Code comments: 0 open, 0 closed');
  });
});

describe('pr status --pr-number / --branch (#123)', () => {
  beforeEach(() => {
    // The file-level hooks never reset call history; these tests assert on it.
    vi.mocked(getCurrentBranch).mockClear();
    vi.mocked(listPullRequests).mockClear();
    vi.mocked(getPullRequestById).mockReset();
    vi.mocked(getPullRequestChecks).mockClear();
    vi.mocked(requireAuthCredential).mockClear();
  });

  it('--pr-number shows that pull request without reading the git branch', async () => {
    vi.mocked(getPullRequestById).mockResolvedValue(
      makePullRequest({ id: 77, title: 'Other PR', status: 'active', sourceRefName: 'refs/heads/feature/other' }),
    );
    vi.mocked(getPullRequestChecks).mockResolvedValue([makeCheck()]);

    await run(['--pr-number', '77', '--json']);

    expect(getCurrentBranch).not.toHaveBeenCalled();
    expect(listPullRequests).not.toHaveBeenCalled();
    expect(getPullRequestById).toHaveBeenCalledWith(
      { org: 'test-org', project: 'test-project' }, 'repo-name', expect.anything(), 77,
    );
    expect(getPullRequestChecks).toHaveBeenCalledWith(expect.anything(), 'repo-name', expect.anything(), 77);
    const parsed = JSON.parse(getStdout());
    expect(parsed.branch).toBe('feature/other');
    expect(parsed.repository).toBe('repo-name');
    expect(parsed.pullRequests).toHaveLength(1);
    expect(parsed.pullRequests[0].id).toBe(77);
    expect(parsed.pullRequests[0].checks[0].name).toBe('security/sca');
    expect(parsed.pullRequests[0].codeCommentCounts).toEqual({ open: 0, closed: 0 });
  });

  it('--pr-number prints the same text block as the default view', async () => {
    vi.mocked(getPullRequestById).mockResolvedValue(makePullRequest({ title: 'Test PR', status: 'completed' }));

    await run(['--pr-number', '12']);

    const output = getStdout();
    expect(output).toContain('#12 [completed] Test PR');
    expect(output).toContain('feature/test -> develop');
    expect(output).toContain('Checks: none reported by Azure DevOps');
  });

  it('--pr-number for an unknown PR exits 3 with a clear message and empty stdout', async () => {
    vi.mocked(getPullRequestById).mockRejectedValue(new Error('NOT_FOUND'));

    await run(['--pr-number', '999', '--json']);

    expect(getStderr()).toContain('Pull request #999 not found in test-org/test-project/repo-name.');
    expect(getExitCode()).toBe(3);
    expect(getStdout()).toBe('');
    expect(getPullRequestChecks).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', 'abc', '1.5'])('--pr-number %s is rejected before any network call', async (raw) => {
    await run(['--pr-number', raw]);

    expect(getStderr()).toContain(`Invalid --pr-number "${raw}"; expected a positive integer.`);
    expect(getExitCode()).toBe(1);
    expect(requireAuthCredential).not.toHaveBeenCalled();
    expect(getPullRequestById).not.toHaveBeenCalled();
  });

  it('--branch lists that branch\'s pull requests without reading the git branch', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([
      makePullRequest({ id: 5, title: 'A', status: 'active', sourceRefName: 'refs/heads/feature/other' }),
      makePullRequest({ id: 6, title: 'B', status: 'active', sourceRefName: 'refs/heads/feature/other' }),
    ]);

    await run(['--branch', 'feature/other', '--json']);

    expect(getCurrentBranch).not.toHaveBeenCalled();
    expect(listPullRequests).toHaveBeenCalledWith(
      { org: 'test-org', project: 'test-project' }, 'repo-name', expect.anything(), 'feature/other',
    );
    const parsed = JSON.parse(getStdout());
    expect(parsed.branch).toBe('feature/other');
    expect(parsed.pullRequests.map((pr: { id: number }) => pr.id)).toEqual([5, 6]);
  });

  it('--branch accepts and strips a refs/heads/ prefix', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([makePullRequest({ title: 'T', status: 'active' })]);

    await run(['--branch', 'refs/heads/feature/test']);

    expect(listPullRequests).toHaveBeenCalledWith(expect.anything(), 'repo-name', expect.anything(), 'feature/test');
    expect(getStdout()).toContain('#12 [active] T');
  });

  it('--branch with no pull requests exits 1 with a clear message and empty stdout', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([]);

    await run(['--branch', 'nope', '--json']);

    expect(getStderr()).toContain('No pull requests found for branch nope in test-org/test-project/repo-name.');
    expect(getExitCode()).toBe(1);
    expect(getStdout()).toBe('');
  });

  it('an empty --branch is rejected before any network call', async () => {
    await run(['--branch', '  ']);

    expect(getStderr()).toContain('--branch must not be empty.');
    expect(getExitCode()).toBe(1);
    expect(requireAuthCredential).not.toHaveBeenCalled();
  });

  it('--pr-number and --branch together are rejected before any network call', async () => {
    await run(['--pr-number', '12', '--branch', 'feature/test']);

    expect(getStderr()).toContain('Cannot specify both --pr-number and --branch.');
    expect(getExitCode()).toBe(1);
    expect(getStdout()).toBe('');
    expect(requireAuthCredential).not.toHaveBeenCalled();
    expect(listPullRequests).not.toHaveBeenCalled();
    expect(getPullRequestById).not.toHaveBeenCalled();
  });

  it('without either option the current-branch view is unchanged (empty is still a success)', async () => {
    await run([]);

    expect(getCurrentBranch).toHaveBeenCalled();
    expect(getStdout()).toContain('No pull requests found for branch feature/test.');
    expect(getExitCode()).not.toBe(1);
  });

  it('--help documents both options and their exclusivity', async () => {
    await run(['--help']);

    const help = getStdout();
    expect(help).toContain('--pr-number <id>');
    expect(help).toContain('--branch <name>');
    expect(help).toContain('mutually exclusive with --branch');
    expect(help).toContain('Mutually exclusive with --pr-number');
  });
});
