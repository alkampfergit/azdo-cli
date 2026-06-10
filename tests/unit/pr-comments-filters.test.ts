import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrCommentsCommand } from '../../src/commands/pr.js';
import { createCommandRunner, getStdout, setupProcessSpies } from './helpers/command-test-utils.js';

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

import { getPullRequestThreads, listPullRequests } from '../../src/services/pr-client.js';
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

function comment(content: string) {
  return { id: 1, author: 'Alice', content, publishedAt: null };
}

// A representative mixed set: code-anchored vs general, resolved vs active.
const codeActive = {
  id: 1,
  status: 'active',
  threadContext: 'src/app.ts',
  line: null,
  comments: [comment('please rename this')],
};
const codeResolved = {
  id: 2,
  status: 'fixed',
  threadContext: 'src/util.ts',
  line: null,
  comments: [comment('fixed already')],
};
const generalActive = {
  id: 3,
  status: 'active',
  threadContext: null,
  line: null,
  comments: [comment('overall LGTM discussion')],
};
const generalResolved = {
  id: 4,
  status: 'closed',
  threadContext: null,
  line: null,
  comments: [comment('closed discussion')],
};

beforeEach(() => {
  vi.clearAllMocks();
  setupProcessSpies();
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(detectRepoName).mockReturnValue('repo-name');
  vi.mocked(getCurrentBranch).mockReturnValue('feature/test');
  vi.mocked(listPullRequests).mockResolvedValue([basePullRequest]);
  vi.mocked(getPullRequestThreads).mockResolvedValue([
    codeActive,
    codeResolved,
    generalActive,
    generalResolved,
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function threadIdsFromJson(): number[] {
  return JSON.parse(getStdout()).threads.map((t: { id: number }) => t.id);
}

describe('pr comments filters (#50)', () => {
  it('no new flags: shows all threads (regression / no behaviour change)', async () => {
    await run(['--json']);
    expect(threadIdsFromJson()).toEqual([1, 2, 3, 4]);
  });

  it('--code-related-only: keeps only file-anchored threads', async () => {
    await run(['--code-related-only', '--json']);
    expect(threadIdsFromJson()).toEqual([1, 2]);
  });

  it('--exclude-resolved: drops resolved threads', async () => {
    await run(['--exclude-resolved', '--json']);
    expect(threadIdsFromJson()).toEqual([1, 3]);
  });

  it('--hide-resolved yields the same set as --exclude-resolved (alias)', async () => {
    // --exclude-resolved is asserted to yield [1, 3] above; --hide-resolved
    // must produce the identical filtered set.
    await run(['--hide-resolved', '--json']);
    expect(threadIdsFromJson()).toEqual([1, 3]);
  });

  it('combined --code-related-only --exclude-resolved: only unresolved code threads', async () => {
    await run(['--code-related-only', '--exclude-resolved', '--json']);
    expect(threadIdsFromJson()).toEqual([1]);
  });

  it('prints an informative message when filters remove everything', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([generalResolved]);
    await run(['--code-related-only', '--exclude-resolved']);
    const out = getStdout();
    expect(out).toContain('no code-related unresolved comment threads');
    expect(out).toContain('filtered from 1 thread');
  });
});
