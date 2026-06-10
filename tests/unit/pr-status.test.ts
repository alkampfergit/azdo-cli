import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrStatusCommand } from '../../src/commands/pr.js';
import { createCommandRunner, getExitCode, getStderr, getStdout, setupProcessSpies } from './helpers/command-test-utils.js';

vi.mock('../../src/services/pr-client.js', () => ({
  listPullRequests: vi.fn(),
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
}));

vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(),
}));

import {
  getPullRequestBuilds,
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

  it('prints an authentication error and exits with code 1', async () => {
    vi.mocked(listPullRequests).mockRejectedValue(new Error('AUTH_FAILED'));
    await run([]);
    expect(getStderr()).toContain('Authentication failed');
    expect(getExitCode()).toBe(1);
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
      { id: 1, status: 'active', threadContext: 'src/a.ts', comments: [] },
      { id: 2, status: 'active', threadContext: 'src/b.ts', comments: [] },
      { id: 3, status: 'fixed', threadContext: 'src/c.ts', comments: [] },
      { id: 4, status: 'active', threadContext: null, comments: [] }, // general — excluded
    ]);

    await run([]);

    expect(getStdout()).toContain('Code comments: 2 open, 1 closed');
  });

  it('reports zero code-comment counts when there are no code-anchored threads', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([makePullRequest({ title: 'Test PR', status: 'active' })]);
    vi.mocked(getPullRequestThreads).mockResolvedValue([
      { id: 4, status: 'active', threadContext: null, comments: [] },
    ]);

    await run([]);

    expect(getStdout()).toContain('Code comments: 0 open, 0 closed');
  });
});
