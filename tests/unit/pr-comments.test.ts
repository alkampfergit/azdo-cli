import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrCommentsCommand } from '../../src/commands/pr.js';
import { createCommandRunner, getStderr, getStdout, setupProcessSpies } from './helpers/command-test-utils.js';

vi.mock('../../src/services/pr-client.js', () => ({
  listPullRequests: vi.fn(),
  getPullRequestThreads: vi.fn(),
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

import { getPullRequestThreads, listPullRequests } from '../../src/services/pr-client.js';
import { detectRepoName, getCurrentBranch } from '../../src/services/git-remote.js';
import { requirePat } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createPrCommentsCommand);
const basePullRequest = {
  id: 12,
  title: 'Test PR',
  repository: 'repo-name',
  sourceRefName: 'refs/heads/feature/test',
  targetRefName: 'refs/heads/develop',
  status: 'active',
  createdBy: 'Alice',
  url: 'https://example.test/pr/12',
} as const;

function makePullRequest(
  overrides: Partial<typeof basePullRequest> & Pick<typeof basePullRequest, 'title' | 'status'>,
) {
  return {
    ...basePullRequest,
    ...overrides,
  };
}

beforeEach(() => {
  setupProcessSpies();
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(requirePat).mockResolvedValue({ pat: 'test-pat', source: 'env' });
  vi.mocked(detectRepoName).mockReturnValue('repo-name');
  vi.mocked(getCurrentBranch).mockReturnValue('feature/test');
  vi.mocked(listPullRequests).mockResolvedValue([basePullRequest]);
  vi.mocked(getPullRequestThreads).mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pr comments command', () => {
  it('fails when no active pull request exists', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([]);
    await run([]);
    expect(getStderr()).toContain('No active pull request found for branch feature/test.');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('fails when multiple active pull requests exist', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([
      makePullRequest({ title: 'PR 1', status: 'active' }),
      {
        ...makePullRequest({ title: 'PR 2', status: 'active' }),
        id: 13,
        url: 'https://example.test/pr/13',
      },
    ]);

    await run([]);

    expect(getStderr()).toContain('Multiple active pull requests found for branch feature/test: #12, #13. Use pr status to review them.');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('prints a no-active-comments message when no active threads exist', async () => {
    await run([]);
    expect(getStdout()).toContain('Pull request #12 has no active comments.');
  });

  it('prints thread headers and indented comments for active threads', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([
      {
        id: 100,
        status: 'active',
        threadContext: '/src/file.ts',
        comments: [
          { id: 1, author: 'Alice', content: 'Please fix this', publishedAt: '2026-03-27T00:00:00Z' },
        ],
      },
      {
        id: 101,
        status: 'pending',
        threadContext: null,
        comments: [
          { id: 2, author: 'Bob', content: 'Still waiting', publishedAt: '2026-03-27T00:00:00Z' },
        ],
      },
    ]);

    await run([]);

    const output = getStdout();
    expect(output).toContain('Active comments for pull request #12: Test PR');
    expect(output).toContain('Thread #100 [active] /src/file.ts');
    expect(output).toContain('  Alice: Please fix this');
    expect(output).toContain('Thread #101 [pending] (general)');
    expect(output).toContain('  Bob: Still waiting');
  });

  it('prints JSON output with --json', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([
      {
        id: 100,
        status: 'active',
        threadContext: '/src/file.ts',
        comments: [
          { id: 1, author: 'Alice', content: 'Please fix this', publishedAt: '2026-03-27T00:00:00Z' },
        ],
      },
    ]);

    await run(['--json']);

    expect(JSON.parse(getStdout())).toEqual({
      branch: 'feature/test',
      pullRequest: basePullRequest,
      threads: [
        {
          id: 100,
          status: 'active',
          threadContext: '/src/file.ts',
          comments: [
            {
              id: 1,
              author: 'Alice',
              content: 'Please fix this',
              publishedAt: '2026-03-27T00:00:00Z',
            },
          ],
        },
      ],
    });
  });
});
