import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AzdoContext } from '../../src/types/work-item.js';
import {
  getPullRequestById,
  getPullRequestChecks,
  getPullRequestThreads,
  isThreadResolved,
  listPullRequests,
  openPullRequest,
  patchThreadStatus,
} from '../../src/services/pr-client.js';

const context: AzdoContext = { org: 'test-org', project: 'test-project' };

describe('pr-client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('listPullRequests', () => {
    it('maps pull requests from the Azure DevOps response', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          count: 1,
          value: [
            {
              pullRequestId: 12,
              title: 'Test PR',
              status: 'active',
              sourceRefName: 'refs/heads/feature/test',
              targetRefName: 'refs/heads/develop',
              createdBy: { displayName: 'Alice' },
              _links: { web: { href: 'https://example.test/pr/12' } },
            },
          ],
        }),
      } as Response);

      const result = await listPullRequests(context, 'repo-name', 'pat', 'feature/test');

      expect(result).toEqual([
        {
          id: 12,
          title: 'Test PR',
          repository: 'repo-name',
          sourceRefName: 'refs/heads/feature/test',
          targetRefName: 'refs/heads/develop',
          status: 'active',
          createdBy: 'Alice',
          url: 'https://example.test/pr/12',
        },
      ]);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('searchCriteria.sourceRefName=refs%2Fheads%2Ffeature%2Ftest'),
        expect.any(Object),
      );
    });

    it('returns an empty array when Azure DevOps returns no PRs', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ count: 0, value: [] }),
      } as Response);

      await expect(listPullRequests(context, 'repo-name', 'pat', 'feature/test')).resolves.toEqual([]);
    });

    it('throws AUTH_FAILED on authentication failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
      } as Response);

      await expect(listPullRequests(context, 'repo-name', 'pat', 'feature/test')).rejects.toThrow('AUTH_FAILED');
    });

    it('tolerates pull requests whose _links.web is missing (root cause of #34)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          count: 1,
          value: [
            {
              pullRequestId: 77,
              title: 'PR without web link',
              status: 'active',
              sourceRefName: 'refs/heads/feature/x',
              targetRefName: 'refs/heads/develop',
              createdBy: { displayName: 'Alice' },
              // no _links at all — the Azure DevOps API can omit this field
            },
          ],
        }),
      } as Response);

      const result = await listPullRequests(context, 'repo-name', 'pat', 'feature/x');
      expect(result).toEqual([
        expect.objectContaining({
          id: 77,
          title: 'PR without web link',
          url: null,
        }),
      ]);
    });

    it('tolerates a _links envelope without the nested web.href', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          count: 1,
          value: [
            {
              pullRequestId: 78,
              title: 'PR with half-populated _links',
              status: 'active',
              sourceRefName: 'refs/heads/feature/y',
              targetRefName: 'refs/heads/develop',
              createdBy: { displayName: 'Alice' },
              _links: { web: {} },
            },
          ],
        }),
      } as Response);

      const result = await listPullRequests(context, 'repo-name', 'pat', 'feature/y');
      expect(result[0].url).toBeNull();
    });
  });

  describe('getPullRequestById', () => {
    it('maps the single-PR response via mapPullRequest and hits the by-id endpoint', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          pullRequestId: 64,
          title: 'Reference PR',
          status: 'active',
          sourceRefName: 'refs/heads/feature/x',
          targetRefName: 'refs/heads/develop',
          createdBy: { displayName: 'Alice' },
          _links: { web: { href: 'https://example.test/pr/64' } },
        }),
      } as Response);

      const result = await getPullRequestById(context, 'repo-name', 'pat', 64);
      expect(result).toEqual({
        id: 64,
        title: 'Reference PR',
        repository: 'repo-name',
        sourceRefName: 'refs/heads/feature/x',
        targetRefName: 'refs/heads/develop',
        status: 'active',
        createdBy: 'Alice',
        url: 'https://example.test/pr/64',
      });
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/pullRequests/64'),
        expect.any(Object),
      );
    });

    it('throws NOT_FOUND on a 404 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      await expect(getPullRequestById(context, 'repo-name', 'pat', 999999)).rejects.toThrow(/NOT_FOUND/);
    });

    it('throws AUTH_FAILED on a 401 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
      } as Response);

      await expect(getPullRequestById(context, 'repo-name', 'pat', 64)).rejects.toThrow('AUTH_FAILED');
    });

    it('tolerates a response without _links (same defensiveness as listPullRequests)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          pullRequestId: 77,
          title: 'No web link',
          status: 'active',
          sourceRefName: 'refs/heads/feature/y',
          targetRefName: 'refs/heads/develop',
        }),
      } as Response);

      const result = await getPullRequestById(context, 'repo-name', 'pat', 77);
      expect(result.url).toBeNull();
    });
  });

  describe('patchThreadStatus', () => {
    it('sends PATCH with the right URL and body for resolve (fixed)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 17,
          status: 'fixed',
          comments: [
            { id: 1, author: { displayName: 'Alice' }, content: 'done', publishedDate: null },
          ],
        }),
      } as Response);

      const result = await patchThreadStatus(context, 'repo-name', 'pat', 64, 17, 'fixed');

      expect(result.status).toBe('fixed');
      expect(result.id).toBe(17);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/pullRequests/64/threads/17'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'fixed' }),
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }),
      );
    });

    it('sends PATCH with status=active for reopen', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 17,
          status: 'active',
          comments: [
            { id: 1, author: { displayName: 'Alice' }, content: 'back open', publishedDate: null },
          ],
        }),
      } as Response);

      const result = await patchThreadStatus(context, 'repo-name', 'pat', 64, 17, 'active');

      expect(result.status).toBe('active');
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ body: JSON.stringify({ status: 'active' }) }),
      );
    });

    it('throws NOT_FOUND on a 404 response (thread missing)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      await expect(patchThreadStatus(context, 'repo-name', 'pat', 64, 9999, 'fixed')).rejects.toThrow(/NOT_FOUND/);
    });

    it('throws AUTH_FAILED on a 401 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
      } as Response);

      await expect(patchThreadStatus(context, 'repo-name', 'pat', 64, 17, 'fixed')).rejects.toThrow('AUTH_FAILED');
    });
  });

  describe('isThreadResolved', () => {
    it.each([
      ['active', false],
      ['pending', false],
      ['unknown', false],
      ['fixed', true],
      ['wontFix', true],
      ['closed', true],
      ['byDesign', true],
    ])('classifies %s as resolved=%s', (status, expected) => {
      expect(isThreadResolved(status)).toBe(expected);
    });
  });

  describe('openPullRequest', () => {
    it('creates a pull request when no active PR already exists', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ count: 0, value: [] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            pullRequestId: 34,
            title: 'New PR',
            status: 'active',
            sourceRefName: 'refs/heads/feature/test',
            targetRefName: 'refs/heads/develop',
            createdBy: { displayName: 'Alice' },
            _links: { web: { href: 'https://example.test/pr/34' } },
          }),
        } as Response);

      const result = await openPullRequest(context, 'repo-name', 'pat', 'feature/test', 'New PR', 'Description');

      expect(result.created).toBe(true);
      expect(result.pullRequest.id).toBe(34);
      expect(fetchSpy).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            sourceRefName: 'refs/heads/feature/test',
            targetRefName: 'refs/heads/develop',
            title: 'New PR',
            description: 'Description',
          }),
        }),
      );
    });

    it('reuses an existing active pull request', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          count: 1,
          value: [
            {
              pullRequestId: 22,
              title: 'Existing PR',
              status: 'active',
              sourceRefName: 'refs/heads/feature/test',
              targetRefName: 'refs/heads/develop',
              createdBy: { displayName: 'Alice' },
              _links: { web: { href: 'https://example.test/pr/22' } },
            },
          ],
        }),
      } as Response);

      const result = await openPullRequest(context, 'repo-name', 'pat', 'feature/test', 'Ignored', 'Ignored');

      expect(result).toEqual({
        branch: 'feature/test',
        targetBranch: 'develop',
        created: false,
        pullRequest: {
          id: 22,
          title: 'Existing PR',
          repository: 'repo-name',
          sourceRefName: 'refs/heads/feature/test',
          targetRefName: 'refs/heads/develop',
          status: 'active',
          createdBy: 'Alice',
          url: 'https://example.test/pr/22',
        },
      });
    });

    it('throws an ambiguity error when multiple active PRs exist', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          count: 2,
          value: [
            {
              pullRequestId: 22,
              title: 'PR 1',
              status: 'active',
              sourceRefName: 'refs/heads/feature/test',
              targetRefName: 'refs/heads/develop',
              _links: { web: { href: 'https://example.test/pr/22' } },
            },
            {
              pullRequestId: 23,
              title: 'PR 2',
              status: 'active',
              sourceRefName: 'refs/heads/feature/test',
              targetRefName: 'refs/heads/develop',
              _links: { web: { href: 'https://example.test/pr/23' } },
            },
          ],
        }),
      } as Response);

      await expect(openPullRequest(context, 'repo-name', 'pat', 'feature/test', 'Title', 'Description'))
        .rejects.toThrow('AMBIGUOUS_PRS:22,23');
    });
  });

  describe('getPullRequestChecks', () => {
    it('maps and filters Azure DevOps pull request statuses', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          count: 5,
          value: [
            {
              id: 1,
              state: 'succeeded',
              description: 'Build passed',
              context: { genre: 'ci', name: 'build' },
              creationDate: '2026-03-31T10:00:00Z',
              updatedDate: '2026-03-31T10:05:00Z',
              createdBy: { displayName: 'Azure Pipelines' },
              targetUrl: 'https://example.test/build/1',
            },
            {
              id: 2,
              state: 'failed',
              description: 'Unit tests failed',
              context: { name: 'unit-tests' },
              creationDate: '2026-03-31T10:01:00Z',
              updatedDate: '2026-03-31T10:06:00Z',
            },
            {
              id: 3,
              state: 'error',
              description: null,
              context: {},
              creationDate: '2026-03-31T10:02:00Z',
              updatedDate: '2026-03-31T10:07:00Z',
            },
            {
              id: 4,
              state: 'notApplicable',
              context: { genre: 'policy', name: 'lint' },
            },
            {
              id: 5,
              state: 'notSet',
              context: { genre: 'policy', name: 'security' },
            },
          ],
        }),
      } as Response);

      const result = await getPullRequestChecks(context, 'repo-name', 'pat', 12);

      expect(result).toEqual([
        {
          id: 1,
          state: 'succeeded',
          name: 'ci/build',
          description: 'Build passed',
          targetUrl: 'https://example.test/build/1',
          createdBy: 'Azure Pipelines',
          createdAt: '2026-03-31T10:00:00Z',
          updatedAt: '2026-03-31T10:05:00Z',
        },
        {
          id: 2,
          state: 'failed',
          name: 'unit-tests',
          description: 'Unit tests failed',
          targetUrl: null,
          createdBy: null,
          createdAt: '2026-03-31T10:01:00Z',
          updatedAt: '2026-03-31T10:06:00Z',
        },
        {
          id: 3,
          state: 'error',
          name: 'Status #3',
          description: null,
          targetUrl: null,
          createdBy: null,
          createdAt: '2026-03-31T10:02:00Z',
          updatedAt: '2026-03-31T10:07:00Z',
        },
      ]);
    });

    it('throws AUTH_FAILED on authentication failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
      } as Response);

      await expect(getPullRequestChecks(context, 'repo-name', 'pat', 12)).rejects.toThrow('AUTH_FAILED');
    });
  });

  describe('getPullRequestThreads', () => {
    it('returns every thread status with visible comments, regardless of resolution state', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            {
              id: 1,
              status: 'active',
              threadContext: { filePath: '/src/file.ts' },
              comments: [
                { id: 10, author: { displayName: 'Alice' }, content: 'Needs work', publishedDate: '2026-03-27T00:00:00Z' },
                { id: 11, author: { displayName: 'Bob' }, content: '   ', publishedDate: '2026-03-27T00:00:00Z' },
              ],
            },
            {
              id: 2,
              status: 'closed',
              comments: [
                { id: 12, author: { displayName: 'Alice' }, content: 'Closed', publishedDate: '2026-03-27T00:00:00Z' },
              ],
            },
            {
              id: 3,
              status: 'pending',
              comments: [
                { id: 13, author: { displayName: 'Bob' }, content: 'Pending review', publishedDate: '2026-03-27T00:00:00Z' },
                { id: 14, author: { displayName: 'Alice' }, content: 'Deleted', isDeleted: true, publishedDate: '2026-03-27T00:00:00Z' },
              ],
            },
            {
              id: 4,
              status: 'active',
              comments: [
                { id: 15, author: { displayName: 'Alice' }, content: '  ', isDeleted: true, publishedDate: '2026-03-27T00:00:00Z' },
              ],
            },
          ],
        }),
      } as Response);

      const result = await getPullRequestThreads(context, 'repo-name', 'pat', 42);

      expect(result).toEqual([
        {
          id: 1,
          status: 'active',
          threadContext: '/src/file.ts',
          comments: [
            {
              id: 10,
              author: 'Alice',
              content: 'Needs work',
              publishedAt: '2026-03-27T00:00:00Z',
            },
          ],
        },
        {
          id: 2,
          status: 'closed',
          threadContext: null,
          comments: [
            {
              id: 12,
              author: 'Alice',
              content: 'Closed',
              publishedAt: '2026-03-27T00:00:00Z',
            },
          ],
        },
        {
          id: 3,
          status: 'pending',
          threadContext: null,
          comments: [
            {
              id: 13,
              author: 'Bob',
              content: 'Pending review',
              publishedAt: '2026-03-27T00:00:00Z',
            },
          ],
        },
      ]);
    });
  });
});
