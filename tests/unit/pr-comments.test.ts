import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrCommentsCommand } from '../../src/commands/pr.js';
import { createCommandRunner, getExitCode, getStderr, getStdout, setupProcessSpies } from './helpers/command-test-utils.js';

vi.mock('../../src/services/pr-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/pr-client.js')>();
  return {
    ...actual,
    listPullRequests: vi.fn(),
    getPullRequestThreads: vi.fn(),
    getPullRequestById: vi.fn(),
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

import { getPullRequestById, getPullRequestThreads, listPullRequests } from '../../src/services/pr-client.js';
import { detectRepoName, getCurrentBranch } from '../../src/services/git-remote.js';
import { requireAuthCredential } from '../../src/services/auth.js';
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
  vi.clearAllMocks();
  setupProcessSpies();
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(detectRepoName).mockReturnValue('repo-name');
  vi.mocked(getCurrentBranch).mockReturnValue('feature/test');
  vi.mocked(listPullRequests).mockResolvedValue([basePullRequest]);
  vi.mocked(getPullRequestThreads).mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pr comments command --pr-number', () => {
  it.each([
    ['abc'],
    ['-3'],
    ['0'],
    ['3.14'],
    [' 42'],
    ['+7'],
    ['0x10'],
  ])('rejects invalid --pr-number %s and exits non-zero without crashing', async (raw) => {
    await run(['--pr-number', raw]);
    expect(getStderr()).toContain(`Invalid --pr-number "${raw}"`);
    expect(getExitCode()).toBe(1);
  });

  it('targets the PR by number, bypassing branch resolution', async () => {
    vi.mocked(getPullRequestById).mockResolvedValue({
      id: 64,
      title: 'Reference PR',
      repository: 'repo-name',
      sourceRefName: 'refs/heads/feature/other',
      targetRefName: 'refs/heads/develop',
      status: 'active',
      createdBy: 'Alice',
      url: 'https://example.test/pr/64',
    });
    vi.mocked(getPullRequestThreads).mockResolvedValue([
      { id: 500, status: 'active', threadContext: null, comments: [{ id: 1, author: 'A', content: 'hi', publishedAt: null }] },
    ]);

    await run(['--pr-number', '64']);

    expect(vi.mocked(getPullRequestById)).toHaveBeenCalledWith(expect.any(Object), 'repo-name', expect.objectContaining({ pat: 'test-pat' }), 64);
    expect(vi.mocked(listPullRequests)).not.toHaveBeenCalled();
    expect(getStdout()).toContain('Comment threads for pull request #64: Reference PR');
    expect(getStdout()).toContain('Thread #500 [active]');
    expect(getExitCode()).toBe(0);
  });

  it('surfaces a clean PR-not-found error on a 404', async () => {
    vi.mocked(getPullRequestById).mockRejectedValue(new Error('NOT_FOUND: pull request 9999999'));

    await run(['--pr-number', '9999999']);

    expect(getStderr()).toContain('Pull request #9999999 not found in test-org/test-project/repo-name');
    expect(getExitCode()).toBe(1);
  });

  it('falls back to branch lookup when --pr-number is absent', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([]);
    await run([]);
    expect(vi.mocked(listPullRequests)).toHaveBeenCalled();
    expect(vi.mocked(getPullRequestById)).not.toHaveBeenCalled();
  });
});

describe('pr comments command', () => {
  it('fails when no active pull request exists', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([]);
    await run([]);
    expect(getStderr()).toContain('No active pull request found for branch feature/test.');
    expect(getExitCode()).toBe(1);
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
    expect(getExitCode()).toBe(1);
  });

  it('prints a no-active-comments message when no active threads exist', async () => {
    await run([]);
    expect(getStdout()).toContain('Pull request #12 has no comment threads.');
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
    expect(output).toContain('Comment threads for pull request #12: Test PR');
    expect(output).toContain('Thread #100 [active] /src/file.ts');
    expect(output).toContain('  Alice: Please fix this');
    expect(output).toContain('Thread #101 [pending] (general)');
    expect(output).toContain('  Bob: Still waiting');
  });

  it('renders a [resolved] indicator for every settled thread status (FR-003)', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([
      { id: 200, status: 'active', threadContext: null, comments: [{ id: 1, author: 'A', content: 'open', publishedAt: null }] },
      { id: 201, status: 'fixed', threadContext: null, comments: [{ id: 2, author: 'A', content: 'done', publishedAt: null }] },
      { id: 202, status: 'wontFix', threadContext: null, comments: [{ id: 3, author: 'A', content: 'no thanks', publishedAt: null }] },
      { id: 203, status: 'closed', threadContext: null, comments: [{ id: 4, author: 'A', content: 'closed', publishedAt: null }] },
      { id: 204, status: 'byDesign', threadContext: null, comments: [{ id: 5, author: 'A', content: 'intentional', publishedAt: null }] },
      { id: 205, status: 'pending', threadContext: null, comments: [{ id: 6, author: 'A', content: 'waiting', publishedAt: null }] },
    ]);

    await run([]);
    const output = getStdout();

    expect(output).toContain('Thread #200 [active]');
    expect(output).toContain('Thread #201 [resolved]');
    expect(output).toContain('Thread #202 [resolved]');
    expect(output).toContain('Thread #203 [resolved]');
    expect(output).toContain('Thread #204 [resolved]');
    expect(output).toContain('Thread #205 [pending]');
  });

  it('hides settled threads when --hide-resolved is set (FR-004a)', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([
      { id: 300, status: 'active', threadContext: null, comments: [{ id: 1, author: 'A', content: 'open', publishedAt: null }] },
      { id: 301, status: 'fixed', threadContext: null, comments: [{ id: 2, author: 'A', content: 'done', publishedAt: null }] },
      { id: 302, status: 'pending', threadContext: null, comments: [{ id: 3, author: 'A', content: 'waiting', publishedAt: null }] },
      { id: 303, status: 'closed', threadContext: null, comments: [{ id: 4, author: 'A', content: 'shut', publishedAt: null }] },
    ]);

    await run(['--hide-resolved']);
    const output = getStdout();

    expect(output).toContain('Thread #300 [active]');
    expect(output).toContain('Thread #302 [pending]');
    expect(output).not.toContain('Thread #301');
    expect(output).not.toContain('Thread #303');
  });

  it('still shows settled threads when --hide-resolved is absent', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([
      { id: 400, status: 'fixed', threadContext: null, comments: [{ id: 1, author: 'A', content: 'done', publishedAt: null }] },
    ]);

    await run([]);
    const output = getStdout();

    expect(output).toContain('Thread #400 [resolved]');
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
