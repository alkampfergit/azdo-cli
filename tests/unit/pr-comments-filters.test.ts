import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrCommentsCommand } from '../../src/commands/pr.js';
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

const systemThread = {
  id: 5,
  status: 'closed',
  threadContext: null,
  line: null,
  comments: [
    { id: 50, author: 'Microsoft.VisualStudio.Services.TFS', content: 'Alice updated the source branch', publishedAt: null, commentType: 'system' },
  ],
};
const mixedThread = {
  id: 6,
  status: 'active',
  threadContext: null,
  line: null,
  comments: [
    { id: 60, author: 'Bob', content: 'human note', publishedAt: null, commentType: 'text' },
    { id: 61, author: 'Microsoft.VisualStudio.Services.TFS', content: 'build succeeded', publishedAt: null, commentType: 'system' },
  ],
};

describe('pr comments --exclude-system', () => {
  it('keeps system threads by default (no behaviour change)', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([generalActive, systemThread]);
    await run(['--json']);
    expect(threadIdsFromJson()).toEqual([3, 5]);
  });

  it('drops threads whose only comments are system-generated', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([generalActive, systemThread]);
    await run(['--exclude-system', '--json']);
    expect(threadIdsFromJson()).toEqual([3]);
  });

  it('keeps a mixed thread but strips its system comments', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([mixedThread]);
    await run(['--exclude-system', '--json']);
    const [thread] = JSON.parse(getStdout()).threads;
    expect(thread.id).toBe(6);
    expect(thread.comments.map((c: { id: number }) => c.id)).toEqual([60]);
  });

  it('names the non-system filter when it removes everything', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([systemThread]);
    await run(['--exclude-system']);
    expect(getStdout()).toContain('no non-system comment threads');
  });
});

describe('pr comments --max-chars', () => {
  const longThread = {
    id: 7,
    status: 'active',
    threadContext: null,
    line: null,
    comments: [{ id: 70, author: 'Alice', content: 'abcdefghij', publishedAt: null, commentType: 'text' }],
  };

  // 'abcdefghij' is 10 chars: 4 cuts it, 99 is longer than the body, and 0
  // explicitly means "no limit".
  it.each([
    ['truncates and marks the cut', '4', 'abcd […]'],
    ['leaves shorter bodies untouched', '99', 'abcdefghij'],
    ['treats 0 as no limit', '0', 'abcdefghij'],
  ])('%s', async (_label, maxChars, expected) => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([longThread]);
    await run(['--max-chars', maxChars, '--json']);
    expect(JSON.parse(getStdout()).threads[0].comments[0].content).toBe(expected);
  });

  it.each([['-1'], ['abc'], ['2.5']])('rejects an invalid value %s', async (raw) => {
    await run(['--max-chars', raw]);
    expect(getStderr()).toContain(`Invalid --max-chars "${raw}"`);
    expect(getExitCode()).toBe(1);
  });
});

describe('pr comments --repo', () => {
  it('uses the given repository instead of the origin remote', async () => {
    await run(['--repo', 'other-repo', '--json']);

    expect(vi.mocked(detectRepoName)).not.toHaveBeenCalled();
    expect(vi.mocked(getPullRequestThreads)).toHaveBeenCalledWith(
      expect.any(Object),
      'other-repo',
      expect.any(Object),
      12,
    );
  });
});

describe('pr comments --thread', () => {
  it('returns just the requested thread', async () => {
    await run(['--thread', '3', '--json']);
    expect(threadIdsFromJson()).toEqual([3]);
  });

  it('fails when the pull request has no such thread (selector, not filter)', async () => {
    await run(['--thread', '999']);
    expect(getStderr()).toContain('Thread #999 not found on pull request #12.');
    expect(getExitCode()).toBe(3);
  });

  it.each([['abc'], ['0'], ['-2']])('rejects an invalid id %s before any network call', async (raw) => {
    await run(['--thread', raw]);
    expect(vi.mocked(getPullRequestThreads)).not.toHaveBeenCalled();
    expect(getStderr()).toContain(`Invalid --thread "${raw}"`);
    expect(getExitCode()).toBe(1);
  });
});

describe('pr comments --contains', () => {
  it('keeps only threads holding a matching comment', async () => {
    await run(['--contains', 'LGTM', '--json']);
    expect(threadIdsFromJson()).toEqual([3]);
  });

  it('is case-sensitive and literal, not a regex', async () => {
    await run(['--contains', 'lgtm', '--json']);
    expect(threadIdsFromJson()).toEqual([]);

    vi.mocked(process.stdout.write).mockClear();
    await run(['--contains', 'overall.*LGTM', '--json']);
    expect(threadIdsFromJson()).toEqual([]);
  });

  it('matches the full body even when --max-chars truncates it', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([
      {
        id: 9,
        status: 'active',
        threadContext: null,
        line: null,
        comments: [{ id: 90, author: 'Alice', content: 'prefix ' + '"kind":"review-plan"', publishedAt: null, commentType: 'text' }],
      },
    ]);

    await run(['--contains', '"kind":"review-plan"', '--max-chars', '4', '--json']);

    const [thread] = JSON.parse(getStdout()).threads;
    expect(thread.id).toBe(9);
    expect(thread.comments[0].content).toBe('pref […]');
  });

  it('names the matching filter when nothing survives', async () => {
    await run(['--contains', 'nothing-here']);
    expect(getStdout()).toContain('no matching comment threads');
  });
});

describe('pr comments truncation metadata', () => {
  it('reports truncated:false and the real length when nothing is cut', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([generalActive]);
    await run(['--json']);
    const [comment] = JSON.parse(getStdout()).threads[0].comments;
    expect(comment).toMatchObject({ truncated: false, originalLength: 'overall LGTM discussion'.length });
  });

  it('reports truncated:true and the pre-cut length when --max-chars bites', async () => {
    vi.mocked(getPullRequestThreads).mockResolvedValue([generalActive]);
    await run(['--max-chars', '7', '--json']);
    const [comment] = JSON.parse(getStdout()).threads[0].comments;
    expect(comment).toMatchObject({
      content: 'overall […]',
      truncated: true,
      originalLength: 'overall LGTM discussion'.length,
    });
  });
});
