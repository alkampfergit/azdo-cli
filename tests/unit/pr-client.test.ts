import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AzdoContext } from '../../src/types/work-item.js';
import {
  getPullRequestById,
  getPullRequestChecks,
  getPullRequestPolicyEvaluations,
  getPullRequestThreads,
  isThreadResolved,
  listPullRequests,
  openPullRequest,
  patchThreadStatus,
  postThreadComment,
  resolveProjectId,
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
      });

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
      });

      await expect(listPullRequests(context, 'repo-name', 'pat', 'feature/test')).resolves.toEqual([]);
    });

    it('throws AUTH_FAILED on authentication failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
      });

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
      });

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
      });

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
      });

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
      });

      await expect(getPullRequestById(context, 'repo-name', 'pat', 999999)).rejects.toThrow(/NOT_FOUND/);
    });

    it('throws AUTH_FAILED on a 401 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
      });

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
      });

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
      });

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
      });

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
      });

      await expect(patchThreadStatus(context, 'repo-name', 'pat', 64, 9999, 'fixed')).rejects.toThrow(/NOT_FOUND/);
    });

    it('throws AUTH_FAILED on a 401 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
      });

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
        });

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
      });

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
      });

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
      });

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
          source: 'status',
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
          source: 'status',
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
          source: 'status',
        },
      ]);
    });

    it('throws AUTH_FAILED on authentication failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
      });

      await expect(getPullRequestChecks(context, 'repo-name', 'pat', 12)).rejects.toThrow('AUTH_FAILED');
    });
  });

  describe('resolveProjectId', () => {
    it('returns the project GUID from the Projects API', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'abc-123-guid', name: 'test-project' }),
      });

      const id = await resolveProjectId(context, 'pat');
      expect(id).toBe('abc-123-guid');
      expect(fetchSpy.mock.calls[0][0]).toContain('/_apis/projects/test-project');
    });
  });

  describe('getPullRequestPolicyEvaluations', () => {
    it('maps policy evaluations to checks and normalises their state', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            {
              evaluationId: 'e1',
              status: 'approved',
              configuration: { id: 10, type: { displayName: 'Build' }, settings: { displayName: 'Build validation' } },
            },
            { evaluationId: 'e2', status: 'rejected', configuration: { id: 11, type: { displayName: 'Required reviewers' } } },
            { evaluationId: 'e3', status: 'running', configuration: { id: 12, type: { displayName: 'Status' } } },
            { evaluationId: 'e4', status: 'queued', configuration: { id: 13, type: { displayName: 'Queued policy' } } },
            // dropped — no signal
            { evaluationId: 'e5', status: 'notApplicable', configuration: { id: 14, type: { displayName: 'N/A' } } },
            { evaluationId: 'e6', status: 'notSet', configuration: { id: 15, type: { displayName: 'Not set' } } },
          ],
        }),
      });

      const result = await getPullRequestPolicyEvaluations(context, 'pat', 'proj-guid', 12);

      // build artifactId carries project GUID + PR id
      expect(fetchSpy.mock.calls[0][0]).toContain(
        'artifactId=vstfs%3A%2F%2F%2FCodeReview%2FCodeReviewId%2Fproj-guid%2F12',
      );
      expect(result).toEqual([
        { id: 10, state: 'succeeded', name: 'Build validation', description: null, targetUrl: null, createdBy: null, createdAt: null, updatedAt: null, source: 'policy', isBlocking: null },
        { id: 11, state: 'failed', name: 'Required reviewers', description: null, targetUrl: null, createdBy: null, createdAt: null, updatedAt: null, source: 'policy', isBlocking: null },
        { id: 12, state: 'pending', name: 'Status', description: null, targetUrl: null, createdBy: null, createdAt: null, updatedAt: null, source: 'policy', isBlocking: null },
        { id: 13, state: 'pending', name: 'Queued policy', description: null, targetUrl: null, createdBy: null, createdAt: null, updatedAt: null, source: 'policy', isBlocking: null },
      ]);
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
      });

      const result = await getPullRequestThreads(context, 'repo-name', 'pat', 42);

      expect(result).toEqual([
        {
          id: 1,
          status: 'active',
          threadContext: '/src/file.ts',
          line: null,
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
          line: null,
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
          line: null,
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

    it('extracts line from rightFileStart when present', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            {
              id: 10,
              status: 'active',
              threadContext: {
                filePath: '/src/foo.ts',
                rightFileStart: { line: 42, offset: 1 },
                rightFileEnd: { line: 42, offset: 13 },
              },
              comments: [{ id: 1, author: { displayName: 'Alice' }, content: 'fix this', publishedDate: null }],
            },
          ],
        }),
      });

      const result = await getPullRequestThreads(context, 'repo-name', 'pat', 42);
      expect(result[0].line).toBe(42);
    });

    it('falls back to leftFileStart when rightFileStart is absent', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            {
              id: 11,
              status: 'active',
              threadContext: {
                filePath: '/src/foo.ts',
                leftFileStart: { line: 7, offset: 3 },
              },
              comments: [{ id: 1, author: { displayName: 'Alice' }, content: 'old line', publishedDate: null }],
            },
          ],
        }),
      });

      const result = await getPullRequestThreads(context, 'repo-name', 'pat', 42);
      expect(result[0].line).toBe(7);
    });

    it('returns null line when threadContext has filePath but no position fields', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            {
              id: 12,
              status: 'active',
              threadContext: { filePath: '/src/foo.ts' },
              comments: [{ id: 1, author: { displayName: 'Alice' }, content: 'no pos', publishedDate: null }],
            },
          ],
        }),
      });

      const result = await getPullRequestThreads(context, 'repo-name', 'pat', 42);
      expect(result[0].threadContext).toBe('/src/foo.ts');
      expect(result[0].line).toBeNull();
    });

    it('returns null line for general threads (no threadContext)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            {
              id: 13,
              status: 'active',
              comments: [{ id: 1, author: { displayName: 'Bob' }, content: 'general', publishedDate: null }],
            },
          ],
        }),
      });

      const result = await getPullRequestThreads(context, 'repo-name', 'pat', 42);
      expect(result[0].threadContext).toBeNull();
      expect(result[0].line).toBeNull();
    });
  });

  describe('postThreadComment', () => {
    it('posts a reply and maps the response to PostedPrComment', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 3,
          author: { displayName: 'Alice' },
          content: 'Great suggestion!',
          publishedDate: '2026-06-15T13:00:00.000Z',
        }),
      } as Response);

      const result = await postThreadComment(context, 'repo-name', 'pat', 22, 148, 'Great suggestion!');

      expect(result).toEqual({
        id: 3,
        author: 'Alice',
        content: 'Great suggestion!',
        publishedAt: '2026-06-15T13:00:00.000Z',
      });
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/pullRequests/22/threads/148/comments'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ content: 'Great suggestion!', parentCommentId: 0, commentType: 1 }),
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }),
      );
    });

    it('returns null author and publishedAt when omitted from response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 5, content: 'reply text' }),
      } as Response);

      const result = await postThreadComment(context, 'repo-name', 'pat', 22, 148, 'reply text');
      expect(result.author).toBeNull();
      expect(result.publishedAt).toBeNull();
      expect(result.content).toBe('reply text');
    });

    it('throws AUTH_FAILED on a 401 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 401 } as Response);
      await expect(postThreadComment(context, 'repo-name', 'pat', 22, 148, 'hi')).rejects.toThrow('AUTH_FAILED');
    });

    it('throws PERMISSION_DENIED on a 403 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 403 } as Response);
      await expect(postThreadComment(context, 'repo-name', 'pat', 22, 148, 'hi')).rejects.toThrow('PERMISSION_DENIED');
    });

    it('throws NOT_FOUND on a 404 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => '',
        headers: { get: () => null },
      } as unknown as Response);
      await expect(postThreadComment(context, 'repo-name', 'pat', 22, 148, 'hi')).rejects.toThrow(/NOT_FOUND/);
    });

    it('throws NETWORK_ERROR on a network failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
      await expect(postThreadComment(context, 'repo-name', 'pat', 22, 148, 'hi')).rejects.toThrow('NETWORK_ERROR');
    });
  });
});
