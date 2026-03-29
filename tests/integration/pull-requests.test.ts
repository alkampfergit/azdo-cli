/**
 * Integration tests — Pull Request operations.
 *
 * Requires: AZDO_PAT, AZDO_ORG, AZDO_PROJECT, AZDO_REPO environment variables.
 * Optional: AZDO_PR_ID — an existing PR ID for comment/thread tests.
 * Run with: npm run test:integration
 *
 * All tests are read-only; no PRs are created or modified.
 *
 * Covered service functions:
 *   listPullRequests      — query PRs for a branch
 *   getPullRequestThreads — fetch active comment threads on a PR
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getPullRequestThreads,
  listPullRequests,
} from '../../src/services/pr-client.js';
import {
  AZDO_PAT,
  AZDO_REPO,
  AZDO_PR_ID,
  SKIP_PR,
  makeContext,
} from './helpers/integration-utils.js';

describe.skipIf(SKIP_PR)('pull-requests integration', () => {
  const context = makeContext();
  const pat = AZDO_PAT;
  const repo = AZDO_REPO;

  // Probe the Git API once. If the PAT lacks Code (Read) scope every call
  // returns AUTH_FAILED — skip the whole suite with a clear message rather
  // than failing every test.
  let gitApiAccessible = true;

  beforeAll(async () => {
    try {
      await listPullRequests(context, repo, pat, '__connectivity-probe__');
    } catch (err) {
      if (err instanceof Error && err.message === 'AUTH_FAILED') {
        gitApiAccessible = false;
        console.warn(
          '\n⚠  PR tests skipped: PAT lacks Code (Read) scope.\n' +
          '   Regenerate your PAT at https://dev.azure.com/_usersSettings/tokens\n' +
          '   and enable "Code → Read".\n',
        );
      }
      // Any other error (NOT_FOUND, etc.) means the API is reachable.
    }
  });

  beforeEach((ctx) => {
    if (!gitApiAccessible) ctx.skip();
  });

  // ── listPullRequests ──────────────────────────────────────────────────────

  describe('listPullRequests', () => {
    it('returns an array (possibly empty) for a non-existent branch', async () => {
      const result = await listPullRequests(context, repo, pat, 'nonexistent-branch-azdo-cli-test');
      expect(Array.isArray(result)).toBe(true);
    });

    it('returned PR objects have the expected shape', async () => {
      // Use "develop" as source branch — adjust if your default branch differs.
      const results = await listPullRequests(context, repo, pat, 'develop', { status: 'all' });

      for (const pr of results) {
        expect(pr.id).toBeTypeOf('number');
        expect(pr.id).toBeGreaterThan(0);
        expect(pr.title).toBeTypeOf('string');
        expect(pr.repository).toBe(repo);
        expect(pr.sourceRefName).toMatch(/^refs\/heads\//);
        expect(pr.targetRefName).toMatch(/^refs\/heads\//);
        expect(pr.status).toBeTypeOf('string');
        expect(pr.url).toMatch(/^https:\/\/dev\.azure\.com\//);
      }
    });

    it('filters by status=active and returns only active PRs', async () => {
      const results = await listPullRequests(context, repo, pat, 'develop', { status: 'active' });
      for (const pr of results) {
        expect(pr.status).toBe('active');
      }
    });

    it('throws an error when using an invalid PAT', async () => {
      // AzDo may respond with a 401 (→ AUTH_FAILED) or redirect to a login
      // page (→ a JSON parse error). Either way it must not succeed.
      await expect(
        listPullRequests(context, repo, 'bad-pat', 'main'),
      ).rejects.toThrow();
    });

    it('throws an error for a non-existent repository', async () => {
      // Expects NOT_FOUND when the PAT has Code scope; otherwise AUTH_FAILED
      // because AzDo rejects the request before resolving the repo name.
      await expect(
        listPullRequests(context, 'nonexistent-repo-azdo-cli-test', pat, 'main'),
      ).rejects.toThrow();
    });
  });

  // ── getPullRequestThreads ─────────────────────────────────────────────────

  describe.skipIf(!AZDO_PR_ID)('getPullRequestThreads', () => {
    const prId = AZDO_PR_ID!;

    it('returns an array of active comment threads', async () => {
      const threads = await getPullRequestThreads(context, repo, pat, prId);
      expect(Array.isArray(threads)).toBe(true);
    });

    it('each thread has a numeric id and a valid status', async () => {
      const threads = await getPullRequestThreads(context, repo, pat, prId);
      for (const thread of threads) {
        expect(thread.id).toBeTypeOf('number');
        expect(thread.id).toBeGreaterThan(0);
        expect(['active', 'pending']).toContain(thread.status);
      }
    });

    it('each thread contains at least one non-deleted comment', async () => {
      const threads = await getPullRequestThreads(context, repo, pat, prId);
      for (const thread of threads) {
        expect(thread.comments.length).toBeGreaterThan(0);
        for (const comment of thread.comments) {
          expect(comment.id).toBeTypeOf('number');
          expect(comment.content).toBeTypeOf('string');
          expect(comment.content.length).toBeGreaterThan(0);
        }
      }
    });

    it('throws NOT_FOUND for a non-existent PR ID', async () => {
      await expect(
        getPullRequestThreads(context, repo, pat, 999999999),
      ).rejects.toThrow('NOT_FOUND');
    });

    it('throws AUTH_FAILED when using an invalid PAT', async () => {
      await expect(
        getPullRequestThreads(context, repo, 'bad-pat', prId),
      ).rejects.toThrow('AUTH_FAILED');
    });
  });
});
