import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AzdoContext } from '../../src/types/work-item.js';
import {
  buildPullRequestThreadContext,
  buildThreadAnchorContext,
  findChangeTrackingId,
  LINE_END_OFFSET,
  normalizeThreadFilePath,
} from '../../src/services/thread-anchor.js';
import {
  createPullRequestThread,
  getLatestPullRequestIterationId,
  getPullRequestIterationChanges,
} from '../../src/services/pr-client.js';

const context: AzdoContext = { org: 'test-org', project: 'test-project' };

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe('normalizeThreadFilePath', () => {
  it.each([
    ['src/Foo/Bar.cs', '/src/Foo/Bar.cs'],
    ['/src/Foo/Bar.cs', '/src/Foo/Bar.cs'],
    ['src\\Foo\\Bar.cs', '/src/Foo/Bar.cs'],
    ['./src/Foo/Bar.cs', '/src/Foo/Bar.cs'],
    ['.\\src\\Foo.cs', '/src/Foo.cs'],
    ['//src/Foo.cs', '/src/Foo.cs'],
    ['  README.md ', '/  README.md '],
    ['src/my file.cs', '/src/my file.cs'],
  ])('normalises %j to %j', (raw, expected) => {
    expect(normalizeThreadFilePath(raw)).toBe(expected);
  });

  it.each(['', './', '/', '  ', '\t\n'])('returns null for the empty path %j', (raw) => {
    expect(normalizeThreadFilePath(raw)).toBeNull();
  });

  it('keeps two files whose names differ only by whitespace apart', () => {
    const changes = [
      { changeTrackingId: 1, item: { path: '/review.ts' }, changeType: 'edit' },
      { changeTrackingId: 2, item: { path: '/ review.ts' }, changeType: 'add' },
    ];
    const spaced = normalizeThreadFilePath(' review.ts');
    const plain = normalizeThreadFilePath('review.ts');
    expect(spaced).toBe('/ review.ts');
    expect(plain).toBe('/review.ts');
    expect(findChangeTrackingId(changes, spaced ?? '', 'right')).toBe(2);
    expect(findChangeTrackingId(changes, plain ?? '', 'right')).toBe(1);
  });
});

describe('buildThreadAnchorContext', () => {
  it('fills the right side for a single line', () => {
    expect(buildThreadAnchorContext('/src/Foo.cs', 692, 692, 'right')).toEqual({
      filePath: '/src/Foo.cs',
      rightFileStart: { line: 692, offset: 1 },
      rightFileEnd: { line: 692, offset: LINE_END_OFFSET },
    });
  });

  it('fills the left side for a range', () => {
    expect(buildThreadAnchorContext('/src/Foo.cs', 10, 14, 'left')).toEqual({
      filePath: '/src/Foo.cs',
      leftFileStart: { line: 10, offset: 1 },
      leftFileEnd: { line: 14, offset: LINE_END_OFFSET },
    });
  });
});

describe('buildPullRequestThreadContext', () => {
  it('compares the latest iteration with itself and carries the tracking id', () => {
    expect(buildPullRequestThreadContext(4, 7)).toEqual({
      changeTrackingId: 7,
      iterationContext: { firstComparingIteration: 4, secondComparingIteration: 4 },
    });
  });

  it('omits changeTrackingId when the file is untracked', () => {
    expect(buildPullRequestThreadContext(4, undefined)).toEqual({
      iterationContext: { firstComparingIteration: 4, secondComparingIteration: 4 },
    });
  });
});

describe('findChangeTrackingId', () => {
  const changes = [
    { changeTrackingId: 1, item: { path: '/src/a.cs' }, changeType: 'edit' },
    { changeTrackingId: 2, item: { path: '/src/new-name.cs' }, originalPath: '/src/old-name.cs', changeType: 'rename' },
    { changeTrackingId: 3, item: { path: '/src/gone.cs' }, changeType: 'delete' },
  ];

  it('matches the current path on either side', () => {
    expect(findChangeTrackingId(changes, '/src/a.cs', 'right')).toBe(1);
    expect(findChangeTrackingId(changes, '/src/gone.cs', 'left')).toBe(3);
  });

  it("matches a rename's original path only on the left side", () => {
    expect(findChangeTrackingId(changes, '/src/old-name.cs', 'left')).toBe(2);
    expect(findChangeTrackingId(changes, '/src/old-name.cs', 'right')).toBeUndefined();
  });

  it('prefers a rename\'s original path on the left when a new file reuses it', () => {
    const reused = [
      { changeTrackingId: 5, item: { path: '/src/old-name.cs' }, changeType: 'add' },
      { changeTrackingId: 6, item: { path: '/src/new-name.cs' }, originalPath: '/src/old-name.cs', changeType: 'rename' },
    ];
    expect(findChangeTrackingId(reused, '/src/old-name.cs', 'left')).toBe(6);
    expect(findChangeTrackingId(reused, '/src/old-name.cs', 'right')).toBe(5);
  });

  it('is case-sensitive and returns undefined for an unchanged file', () => {
    expect(findChangeTrackingId(changes, '/src/A.cs', 'right')).toBeUndefined();
    expect(findChangeTrackingId(changes, '/src/other.cs', 'right')).toBeUndefined();
  });
});

describe('pull request iteration client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the highest iteration id', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ value: [{ id: 1 }, { id: 4 }, { id: 2 }] }));

    await expect(getLatestPullRequestIterationId(context, 'repo-name', 'pat', 22)).resolves.toBe(4);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/repositories/repo-name/pullRequests/22/iterations?api-version=7.1'),
      expect.anything(),
    );
  });

  it('fails when the pull request reports no iterations', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ value: [] }));

    await expect(getLatestPullRequestIterationId(context, 'repo-name', 'pat', 22)).rejects.toThrow(
      'Pull request #22 has no iterations.',
    );
  });

  it('follows nextSkip until it is exhausted', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ changeEntries: [{ changeTrackingId: 1, item: { path: '/a' } }], nextSkip: 2000, nextTop: 2000 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ changeEntries: [{ changeTrackingId: 2, item: { path: '/b' } }], nextSkip: 0, nextTop: 0 }),
      );

    const changes = await getPullRequestIterationChanges(context, 'repo-name', 'pat', 22, 4);

    expect(changes.map((change) => change.changeTrackingId)).toEqual([1, 2]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const first = new URL(String(fetchSpy.mock.calls[0]?.[0]));
    const second = new URL(String(fetchSpy.mock.calls[1]?.[0]));
    expect(first.pathname).toContain('/pullRequests/22/iterations/4/changes');
    expect(first.searchParams.get('$skip')).toBeNull();
    expect(second.searchParams.get('$skip')).toBe('2000');
    expect(second.searchParams.get('$top')).toBe('2000');
  });

  it('stops on a page without nextSkip', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ changeEntries: [] }));

    await expect(getPullRequestIterationChanges(context, 'repo-name', 'pat', 22, 1)).resolves.toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('sends threadContext and pullRequestThreadContext when creating an anchored thread', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        id: 9,
        status: 'active',
        threadContext: { filePath: '/src/Foo.cs', rightFileStart: { line: 692, offset: 1 } },
        comments: [{ id: 1, content: 'finding' }],
      }),
    );
    const threadContext = buildThreadAnchorContext('/src/Foo.cs', 692, 692, 'right');
    const pullRequestThreadContext = buildPullRequestThreadContext(4, 7);

    const thread = await createPullRequestThread(context, 'repo-name', 'pat', 22, 'finding', 'active', {
      threadContext,
      pullRequestThreadContext,
    });

    expect(thread).toMatchObject({ id: 9, threadContext: '/src/Foo.cs', line: 692 });
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      comments: [{ parentCommentId: 0, content: 'finding', commentType: 1 }],
      status: 'active',
      threadContext,
      pullRequestThreadContext,
    });
  });
});
