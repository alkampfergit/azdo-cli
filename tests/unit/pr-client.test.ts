import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AzdoContext } from '../../src/types/work-item.js';
import {
  createPullRequestThread,
  getPullRequestById,
  getPullRequestChecks,
  getPullRequestPolicyEvaluations,
  getPullRequestThread,
  getPullRequestThreads,
  isThreadResolved,
  listPullRequests,
  listRepositoryPullRequests,
  openPullRequest,
  patchThreadStatus,
  postThreadComment,
  resolveProjectId,
  updateThreadComment,
  resolveRepositoryId,
  getWorkItemRelations,
  linkWorkItemToPullRequest,
  unlinkWorkItemFromPullRequest,
  resolveReviewerIdentity,
  addOrUpdatePullRequestReviewer,
  getPullRequestReviewers,
  removePullRequestReviewer,
  resolvePullRequestTemplate,
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
          description: null,
          createdByUniqueName: null,
          createdById: null,
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
          // No crash, and no null field either: the browser URL is built from
          // org/project/repo/id when the API omits _links.web.
          url: 'https://dev.azure.com/test-org/test-project/_git/repo-name/pullrequest/77',
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
      expect(result[0].url).toBe('https://dev.azure.com/test-org/test-project/_git/repo-name/pullrequest/78');
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
        description: null,
        createdByUniqueName: null,
        createdById: null,
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
      expect(result.url).toBe('https://dev.azure.com/test-org/test-project/_git/repo-name/pullrequest/77');
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
    // Routes by URL/method instead of call order, since resolving the
    // repository + searching for a pull request template now happens
    // between the existing-PR lookup and the create POST.
    function mockOpenPullRequestFetch(opts: { templateContent?: string } = {}): ReturnType<typeof vi.spyOn> {
      return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.includes('/pullrequests?') && method === 'GET') {
          return { ok: true, status: 200, json: async () => ({ count: 0, value: [] }) } as Response;
        }
        if (url.includes('/repositories/repo-name?')) {
          return { ok: true, status: 200, json: async () => ({ id: 'repo-guid', defaultBranch: 'refs/heads/develop' }) } as Response;
        }
        if (url.includes('/repositories/repo-name/items?')) {
          if (opts.templateContent !== undefined && url.includes('pull_request_template.md')) {
            return { ok: true, status: 200, text: async () => opts.templateContent! } as Response;
          }
          return { ok: false, status: 404, headers: { get: () => null } } as unknown as Response;
        }
        if (url.includes('/pullrequests?') && method === 'POST') {
          return {
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
          } as Response;
        }
        throw new Error(`unexpected fetch: ${method} ${url}`);
      });
    }

    it('creates a pull request when no active PR already exists', async () => {
      const fetchSpy = mockOpenPullRequestFetch();

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

    it('uses a repository-defined template when --description is omitted (FR-012)', async () => {
      mockOpenPullRequestFetch({ templateContent: 'Template body' });

      const result = await openPullRequest(context, 'repo-name', 'pat', 'feature/test', 'New PR');

      expect(result.created).toBe(true);
    });

    it('appends the template after the supplied description (FR-014)', async () => {
      const fetchSpy = mockOpenPullRequestFetch({ templateContent: 'Template body' });

      await openPullRequest(context, 'repo-name', 'pat', 'feature/test', 'New PR', 'My summary');

      expect(fetchSpy).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('My summary\\n\\nTemplate body'),
        }),
      );
    });

    it('rejects with DESCRIPTION_REQUIRED when neither --description nor a template exist (FR-013)', async () => {
      mockOpenPullRequestFetch();

      await expect(openPullRequest(context, 'repo-name', 'pat', 'feature/test', 'New PR'))
        .rejects.toThrow('DESCRIPTION_REQUIRED');
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
          description: null,
          createdByUniqueName: null,
          createdById: null,
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

  describe('resolveRepositoryId', () => {
    it('returns the repository GUID', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'repo-guid', defaultBranch: 'refs/heads/develop' }),
      });

      await expect(resolveRepositoryId(context, 'repo-name', 'pat')).resolves.toBe('repo-guid');
    });
  });

  describe('getWorkItemRelations', () => {
    it('returns the relations array', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 1234, relations: [{ rel: 'ArtifactLink', url: 'vstfs:///Git/PullRequestId/p/r/1' }] }),
      });

      await expect(getWorkItemRelations(context, 'pat', 1234)).resolves.toEqual([
        { rel: 'ArtifactLink', url: 'vstfs:///Git/PullRequestId/p/r/1' },
      ]);
    });

    it('returns an empty array when the work item has no relations', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 1234 }),
      });

      await expect(getWorkItemRelations(context, 'pat', 1234)).resolves.toEqual([]);
    });

    it('propagates NOT_FOUND for a nonexistent work item', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404 } as Response);

      await expect(getWorkItemRelations(context, 'pat', 9999)).rejects.toThrow('NOT_FOUND');
    });
  });

  describe('linkWorkItemToPullRequest / unlinkWorkItemFromPullRequest', () => {
    function mockLinkFetch(existingRelations: Array<{ rel: string; url: string }>): void {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.includes('/projects/')) {
          return { ok: true, status: 200, json: async () => ({ id: 'project-guid' }) } as Response;
        }
        if (url.includes('/repositories/repo-name?')) {
          return { ok: true, status: 200, json: async () => ({ id: 'repo-guid' }) } as Response;
        }
        if (url.includes('/workitems/1234') && method === 'GET') {
          return { ok: true, status: 200, json: async () => ({ id: 1234, relations: existingRelations }) } as Response;
        }
        if (url.includes('/workitems/1234') && method === 'PATCH') {
          return { ok: true, status: 200, json: async () => ({ id: 1234 }) } as Response;
        }
        throw new Error(`unexpected fetch: ${method} ${url}`);
      });
    }

    const artifactUri = 'vstfs:///Git/PullRequestId/project-guid/repo-guid/77';

    it('links a work item not yet linked (FR-001)', async () => {
      mockLinkFetch([]);

      const result = await linkWorkItemToPullRequest(context, 'repo-name', 'pat', 77, 1234);

      expect(result).toEqual({ pullRequestId: 77, workItemId: 1234, url: artifactUri, noop: false });
    });

    it('treats an already-linked work item as a no-op (FR-005)', async () => {
      mockLinkFetch([{ rel: 'ArtifactLink', url: artifactUri }]);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const result = await linkWorkItemToPullRequest(context, 'repo-name', 'pat', 77, 1234);

      expect(result.noop).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining('/workitems/1234'), expect.objectContaining({ method: 'PATCH' }));
    });

    it('unlinks a linked work item (FR-002)', async () => {
      mockLinkFetch([{ rel: 'ArtifactLink', url: artifactUri }]);

      const result = await unlinkWorkItemFromPullRequest(context, 'repo-name', 'pat', 77, 1234);

      expect(result).toEqual({ pullRequestId: 77, workItemId: 1234, url: artifactUri, noop: false });
    });

    it('treats an unlinked work item as a no-op on unlink (FR-004)', async () => {
      mockLinkFetch([]);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const result = await unlinkWorkItemFromPullRequest(context, 'repo-name', 'pat', 77, 1234);

      expect(result.noop).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining('/workitems/1234'), expect.objectContaining({ method: 'PATCH' }));
    });
  });

  describe('resolveReviewerIdentity', () => {
    it('resolves a single matching identity', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ value: [{ id: 'identity-guid', providerDisplayName: 'Jane Reviewer' }] }),
      });

      await expect(resolveReviewerIdentity('test-org', 'pat', 'jane@example.com')).resolves.toEqual({
        id: 'identity-guid',
        providerDisplayName: 'Jane Reviewer',
      });
    });

    it('rejects when there are zero matches (FR-009)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ value: [] }) });

      await expect(resolveReviewerIdentity('test-org', 'pat', 'nobody@example.com'))
        .rejects.toThrow('RESOLVE_FAILED:nobody@example.com');
    });

    it('rejects when the input is ambiguous (multiple matches)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ value: [{ id: 'a' }, { id: 'b' }] }),
      });

      await expect(resolveReviewerIdentity('test-org', 'pat', 'ambiguous'))
        .rejects.toThrow('RESOLVE_FAILED:ambiguous');
    });
  });

  describe('addOrUpdatePullRequestReviewer / removePullRequestReviewer', () => {
    it('adds a reviewer as optional by default', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'identity-guid', displayName: 'Jane', uniqueName: 'jane@example.com', isRequired: false, vote: 0 }),
      });

      const result = await addOrUpdatePullRequestReviewer(context, 'repo-name', 'pat', 77, 'identity-guid', false);

      expect(result).toEqual({ id: 'identity-guid', displayName: 'Jane', uniqueName: 'jane@example.com', isRequired: false, vote: 0 });
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/reviewers/identity-guid'),
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ vote: 0, isRequired: false }) }),
      );
    });

    it('promotes an existing reviewer to required in place (FR-011)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'identity-guid', displayName: 'Jane', uniqueName: 'jane@example.com', isRequired: true, vote: 0 }),
      });

      const result = await addOrUpdatePullRequestReviewer(context, 'repo-name', 'pat', 77, 'identity-guid', true);

      expect(result.isRequired).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ body: JSON.stringify({ vote: 0, isRequired: true }) }),
      );
    });

    it('lists current reviewers', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ value: [{ id: 'identity-guid', displayName: 'Jane', uniqueName: 'jane@example.com', isRequired: false, vote: 0 }] }),
      });

      await expect(getPullRequestReviewers(context, 'repo-name', 'pat', 77)).resolves.toEqual([
        { id: 'identity-guid', displayName: 'Jane', uniqueName: 'jane@example.com', isRequired: false, vote: 0 },
      ]);
    });

    it('removes an existing reviewer (FR-008)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
        if ((init?.method ?? 'GET') === 'DELETE') {
          return { ok: true, status: 204, json: async () => ({}) } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ value: [{ id: 'identity-guid', displayName: 'Jane', uniqueName: 'jane@example.com', isRequired: false, vote: 0 }] }),
        } as Response;
      });

      const result = await removePullRequestReviewer(context, 'repo-name', 'pat', 77, 'identity-guid');

      expect(result).toEqual({
        reviewer: { id: 'identity-guid', displayName: 'Jane', uniqueName: 'jane@example.com', isRequired: false, vote: 0 },
        noop: false,
      });
      expect(fetchSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'DELETE' }));
    });

    it('treats removing a non-reviewer as a no-op (FR-010) without calling DELETE', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ value: [] }),
      });

      const result = await removePullRequestReviewer(context, 'repo-name', 'pat', 77, 'identity-guid');

      expect(result).toEqual({ reviewer: null, noop: true });
      expect(fetchSpy).not.toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'DELETE' }));
    });
  });

  describe('resolvePullRequestTemplate', () => {
    function mockTemplateFetch(found: { path: string; content: string } | null): ReturnType<typeof vi.spyOn> {
      return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const requestedPath = new URL(String(input)).searchParams.get('path');
        if (found !== null && requestedPath === found.path) {
          return { ok: true, status: 200, text: async () => found.content } as Response;
        }
        return { ok: false, status: 404, headers: { get: () => null } } as unknown as Response;
      });
    }

    it('finds a branch-specific template under docs/pull_request_template/branches/ (FR-012)', async () => {
      mockTemplateFetch({ path: 'docs/pull_request_template/branches/develop.md', content: 'Branch template' });

      const result = await resolvePullRequestTemplate(context, 'repo-name', 'pat', 'develop', 'develop');

      expect(result).toEqual({ path: 'docs/pull_request_template/branches/develop.md', content: 'Branch template', kind: 'branch' });
    });

    it('falls back through multi-level branch segments (feature/foo/december -> feature/foo -> feature)', async () => {
      mockTemplateFetch({ path: 'docs/pull_request_template/branches/feature.md', content: 'Feature template' });

      const result = await resolvePullRequestTemplate(context, 'repo-name', 'pat', 'develop', 'feature/foo/december');

      expect(result).toEqual({ path: 'docs/pull_request_template/branches/feature.md', content: 'Feature template', kind: 'branch' });
    });

    it('falls back to the repository-wide default template (FR-013)', async () => {
      mockTemplateFetch({ path: 'docs/pull_request_template.md', content: 'Default template' });

      const result = await resolvePullRequestTemplate(context, 'repo-name', 'pat', 'develop', 'develop');

      expect(result).toEqual({ path: 'docs/pull_request_template.md', content: 'Default template', kind: 'default' });
    });

    it('returns null when no template exists anywhere in the search', async () => {
      mockTemplateFetch(null);

      await expect(resolvePullRequestTemplate(context, 'repo-name', 'pat', 'develop', 'develop')).resolves.toBeNull();
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
              commentType: null,
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
              commentType: null,
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
              commentType: null,
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
      });

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
      });

      const result = await postThreadComment(context, 'repo-name', 'pat', 22, 148, 'reply text');
      expect(result.author).toBeNull();
      expect(result.publishedAt).toBeNull();
      expect(result.content).toBe('reply text');
    });

    it('throws AUTH_FAILED on a 401 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 401 });
      await expect(postThreadComment(context, 'repo-name', 'pat', 22, 148, 'hi')).rejects.toThrow('AUTH_FAILED');
    });

    it('throws PERMISSION_DENIED on a 403 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 403 });
      await expect(postThreadComment(context, 'repo-name', 'pat', 22, 148, 'hi')).rejects.toThrow('PERMISSION_DENIED');
    });

    it('throws NOT_FOUND on a 404 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => '',
        headers: { get: () => null },
      });
      await expect(postThreadComment(context, 'repo-name', 'pat', 22, 148, 'hi')).rejects.toThrow(/NOT_FOUND/);
    });

    it('throws NETWORK_ERROR on a network failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
      await expect(postThreadComment(context, 'repo-name', 'pat', 22, 148, 'hi')).rejects.toThrow('NETWORK_ERROR');
    });
  });

  describe('listRepositoryPullRequests', () => {
    function mockList() {
      return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          count: 1,
          value: [
            {
              pullRequestId: 12,
              title: 'Test PR',
              status: 'active',
              description: '  Adds the thing.  ',
              sourceRefName: 'refs/heads/feature/test',
              targetRefName: 'refs/heads/develop',
              createdBy: { displayName: 'Alice' },
              _links: { web: { href: 'https://example.test/pr/12' } },
            },
          ],
        }),
      } as unknown as Response);
    }

    it('omits the source-branch criteria when no branch is given', async () => {
      const fetchSpy = mockList();

      const result = await listRepositoryPullRequests(context, 'repo-name', 'pat', { status: 'all', top: 25 });

      expect(result[0].id).toBe(12);
      const url = String(fetchSpy.mock.calls[0][0]);
      expect(url).not.toContain('searchCriteria.sourceRefName');
      expect(url).toContain('searchCriteria.status=all');
      expect(url).toContain('%24top=25');
    });

    it('filters by source branch when one is given', async () => {
      const fetchSpy = mockList();

      await listRepositoryPullRequests(context, 'repo-name', 'pat', { sourceBranch: 'feature/test' });

      expect(String(fetchSpy.mock.calls[0][0])).toContain(
        'searchCriteria.sourceRefName=refs%2Fheads%2Ffeature%2Ftest',
      );
    });

    it('maps the PR description, trimmed, and nulls an empty one', async () => {
      mockList();
      const [withDescription] = await listRepositoryPullRequests(context, 'repo-name', 'pat');
      expect(withDescription.description).toBe('Adds the thing.');

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          count: 1,
          value: [
            {
              pullRequestId: 13,
              title: 'No description',
              status: 'active',
              sourceRefName: 'refs/heads/feature/x',
              targetRefName: 'refs/heads/develop',
            },
          ],
        }),
      } as unknown as Response);
      const [withoutDescription] = await listRepositoryPullRequests(context, 'repo-name', 'pat');
      expect(withoutDescription.description).toBeNull();
    });
  });

  describe('author identity mapping', () => {
    it('carries uniqueName and id when Azure DevOps returns them', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          pullRequestId: 4804,
          title: 'Identity PR',
          status: 'active',
          sourceRefName: 'refs/heads/feature/z',
          targetRefName: 'refs/heads/develop',
          createdBy: {
            displayName: 'William Verdolini',
            uniqueName: 'william.verdolini@example.test',
            id: '11111111-2222-3333-4444-555555555555',
          },
        }),
      } as unknown as Response);

      const result = await getPullRequestById(context, 'repo-name', 'pat', 4804);

      expect(result.createdBy).toBe('William Verdolini');
      expect(result.createdByUniqueName).toBe('william.verdolini@example.test');
      expect(result.createdById).toBe('11111111-2222-3333-4444-555555555555');
    });
  });

  describe('getPullRequestThread', () => {
    it('fetches a single thread and maps its comments', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 148,
          status: 'active',
          comments: [
            { id: 1, author: { displayName: 'Alice' }, content: 'first', publishedDate: null, commentType: 'text' },
            { id: 2, author: { displayName: 'Bob' }, content: 'second', publishedDate: null, commentType: 'text' },
          ],
        }),
      } as unknown as Response);

      const result = await getPullRequestThread(context, 'repo-name', 'pat', 22, 148);

      expect(result.id).toBe(148);
      expect(result.comments.map((comment) => comment.id)).toEqual([1, 2]);
      expect(String(fetchSpy.mock.calls[0][0])).toContain('/pullRequests/22/threads/148?');
    });

    it('throws NOT_FOUND on a 404 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => '',
        headers: { get: () => null },
      } as unknown as Response);
      await expect(getPullRequestThread(context, 'repo-name', 'pat', 22, 999)).rejects.toThrow(/NOT_FOUND/);
    });
  });

  describe('createPullRequestThread', () => {
    function mockCreated() {
      return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 71936,
          status: 'active',
          comments: [
            { id: 1, author: { displayName: 'Alice' }, content: 'ClaudeCode: build is green', publishedDate: null },
          ],
        }),
      } as unknown as Response);
    }

    it('POSTs a root comment and maps the created thread', async () => {
      const fetchSpy = mockCreated();

      const result = await createPullRequestThread(context, 'repo-name', 'pat', 22, 'ClaudeCode: build is green');

      expect(result.id).toBe(71936);
      expect(result.comments[0]).toMatchObject({ id: 1, content: 'ClaudeCode: build is green' });
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/pullRequests/22/threads?'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            comments: [{ parentCommentId: 0, content: 'ClaudeCode: build is green', commentType: 1 }],
          }),
        }),
      );
    });

    it('includes the thread status only when one is requested', async () => {
      const fetchSpy = mockCreated();

      await createPullRequestThread(context, 'repo-name', 'pat', 22, 'body', 'active');

      expect(JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body))).toEqual({
        comments: [{ parentCommentId: 0, content: 'body', commentType: 1 }],
        status: 'active',
      });
    });

    it('throws AUTH_FAILED on a 401 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 401 } as unknown as Response);
      await expect(createPullRequestThread(context, 'repo-name', 'pat', 22, 'body')).rejects.toThrow('AUTH_FAILED');
    });
  });

  describe('updateThreadComment', () => {
    it('PATCHes the comment body and maps the response', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 1,
          author: { displayName: 'Alice' },
          content: 'corrected text',
          publishedDate: '2026-06-15T13:00:00.000Z',
        }),
      } as unknown as Response);

      const result = await updateThreadComment(context, 'repo-name', 'pat', 22, 148, 1, 'corrected text');

      expect(result).toEqual({
        id: 1,
        author: 'Alice',
        content: 'corrected text',
        publishedAt: '2026-06-15T13:00:00.000Z',
      });
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/pullRequests/22/threads/148/comments/1?'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ content: 'corrected text' }),
        }),
      );
    });

    it('throws PERMISSION_DENIED when editing someone else\'s comment', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 403 } as unknown as Response);
      await expect(updateThreadComment(context, 'repo-name', 'pat', 22, 148, 1, 'x')).rejects.toThrow(
        'PERMISSION_DENIED',
      );
    });
  });
});
