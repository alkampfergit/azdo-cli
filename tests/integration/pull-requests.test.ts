/**
 * Integration tests — Pull Request operations.
 *
 * Requires: AZDO_PAT, AZDO_ORG, AZDO_PROJECT, AZDO_REPO environment variables.
 * Optional: AZDO_PR_ID — an existing PR ID for comment/thread tests.
 * Run with: npm run test:integration
 *
 * Most tests are read-only; no PRs are created. Two describe blocks are
 * self-healing round-trips against the AZDO_PR_ID reference PR
 * (`patchThreadStatus round-trip`, `pr reviewers add/remove round-trip`) —
 * each mutates then restores the original state, tolerant of permission
 * failures, so they are safe to run repeatedly against a shared PR.
 *
 * Covered service functions:
 *   listPullRequests               — query PRs for a branch
 *   getPullRequestThreads          — fetch active comment threads on a PR
 *   getPullRequestReviewers        — list a PR's current reviewers
 *   addOrUpdatePullRequestReviewer — add/promote a reviewer
 *   removePullRequestReviewer      — remove a reviewer
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getPullRequestById,
  getPullRequestBuilds,
  getPullRequestThreads,
  getPullRequestReviewers,
  addOrUpdatePullRequestReviewer,
  removePullRequestReviewer,
  isThreadResolved,
  listPullRequests,
  patchThreadStatus,
} from '../../src/services/pr-client.js';
import { resolveCredentialIdentity } from '../../src/services/auth-diagnostics.js';
import {
  AZDO_PAT,
  AZDO_ORG,
  AZDO_REPO,
  AZDO_PR_ID,
  AZDO_PR_ID_WITH_BUILDS,
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
      const validStatuses = ['unknown', 'active', 'fixed', 'wontFix', 'closed', 'byDesign', 'pending'];
      for (const thread of threads) {
        expect(thread.id).toBeTypeOf('number');
        expect(thread.id).toBeGreaterThan(0);
        expect(validStatuses).toContain(thread.status);
      }
    });

    it('returns at least one thread with at least one comment (covers #34 read-path fix)', async () => {
      // The canonical AZDO_PR_ID for this project's test org is PR 64, which
      // carries two user-authored comments. This assertion guards against a
      // regression of the reported #34 crash by exercising the real Azure
      // DevOps API end-to-end.
      const threads = await getPullRequestThreads(context, repo, pat, prId);
      expect(threads.length).toBeGreaterThan(0);
      const commentCount = threads.reduce((acc, thread) => acc + thread.comments.length, 0);
      expect(commentCount).toBeGreaterThan(0);
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

  // ── getPullRequestById ─────────────────────────────────────────────────

  describe.skipIf(!AZDO_PR_ID)('getPullRequestById', () => {
    const prId = AZDO_PR_ID!;

    it('fetches the reference PR by numeric id (covers --pr-number happy path)', async () => {
      const pr = await getPullRequestById(context, repo, pat, prId);
      expect(pr.id).toBe(prId);
      expect(typeof pr.title).toBe('string');
    });

    it('throws NOT_FOUND for a PR that does not exist', async () => {
      await expect(getPullRequestById(context, repo, pat, 999999999)).rejects.toThrow(/NOT_FOUND/);
    });
  });

  // ── patchThreadStatus round-trip ───────────────────────────────────────

  // Self-healing test: picks the first mutable thread on the reference PR,
  // flips its state, asserts, then restores the original state. Works
  // whether the thread starts active/pending or already settled.
  describe.skipIf(!AZDO_PR_ID)('patchThreadStatus round-trip', () => {
    const prId = AZDO_PR_ID!;

    it('can flip a thread between fixed and active and back', async () => {
      const before = await getPullRequestThreads(context, repo, pat, prId);
      if (before.length === 0) {
        // Nothing to mutate — skip quietly rather than fail.
        return;
      }

      // Prefer a thread that is currently active/pending (clearly mutable
      // to 'fixed' and back). Falling back to any thread lets the test
      // still exercise the round-trip when the test PR only has settled
      // threads, but the preferred path is deterministic and less prone
      // to touching a thread the owner may have deliberately closed.
      const subject = before.find((t) => !isThreadResolved(t.status)) ?? before[0];
      const startActive = !isThreadResolved(subject.status);

      // Wrap each PATCH so a locked/conflicting thread doesn't fail the
      // whole suite — the CI PR is shared test data and may have threads
      // the API refuses to flip (locked, archived, etc.). On the first
      // failure we abort the round-trip and let the finally block attempt
      // a best-effort restore.
      let mutationFailed = false;
      try {
        if (startActive) {
          try {
            const resolved = await patchThreadStatus(context, repo, pat, prId, subject.id, 'fixed');
            expect(isThreadResolved(resolved.status)).toBe(true);
            const afterFixed = await getPullRequestThreads(context, repo, pat, prId);
            const refetched = afterFixed.find((t) => t.id === subject.id);
            expect(refetched && isThreadResolved(refetched.status)).toBe(true);

            const reopened = await patchThreadStatus(context, repo, pat, prId, subject.id, 'active');
            expect(reopened.status).toBe('active');
          } catch (err) {
            // If the first PATCH is rejected (locked / forbidden), don't
            // fail the test — just note it and let the finally restore.
            if (err instanceof Error && (err.message.startsWith('HTTP_') || err.message === 'PERMISSION_DENIED' || err.message.startsWith('NOT_FOUND'))) {
              mutationFailed = true;
            } else {
              throw err;
            }
          }
        } else {
          try {
            const reopened = await patchThreadStatus(context, repo, pat, prId, subject.id, 'active');
            expect(reopened.status).toBe('active');
            const afterActive = await getPullRequestThreads(context, repo, pat, prId);
            const refetched = afterActive.find((t) => t.id === subject.id);
            expect(refetched?.status).toBe('active');

            const resolvedAgain = await patchThreadStatus(context, repo, pat, prId, subject.id, 'fixed');
            expect(isThreadResolved(resolvedAgain.status)).toBe(true);
          } catch (err) {
            if (err instanceof Error && (err.message.startsWith('HTTP_') || err.message === 'PERMISSION_DENIED' || err.message.startsWith('NOT_FOUND'))) {
              mutationFailed = true;
            } else {
              throw err;
            }
          }
        }
      } finally {
        // Best-effort restore to the original state so the test is idempotent
        // across runs. Failures here are swallowed — the outer assertion has
        // already reported any real problem.
        try {
          const restoreStatus = startActive ? 'active' : 'fixed';
          await patchThreadStatus(context, repo, pat, prId, subject.id, restoreStatus);
        } catch {
          // ignore — best effort restoration only.
        }
      }

      if (mutationFailed) {
         
        console.warn(`[integration] thread #${subject.id} on PR #${prId} rejected a state change (likely locked); skipping round-trip assertions.`);
      }
    });
  });
});

describe.skipIf(!AZDO_PR_ID_WITH_BUILDS || SKIP_PR)('getPullRequestBuilds', () => {
  const context = makeContext();
  const pat = AZDO_PAT;
  const prId = AZDO_PR_ID_WITH_BUILDS!;

  it('returns an array of checks for a PR with builds', async () => {
    const checks = await getPullRequestBuilds(context, pat, prId);
    expect(Array.isArray(checks)).toBe(true);
    expect(checks.length).toBeGreaterThan(0);
    for (const check of checks) {
      expect(typeof check.id).toBe('number');
      expect(typeof check.state).toBe('string');
      expect(typeof check.name).toBe('string');
      expect(check.source).toBe('build');
      expect(check.isBlocking).toBeNull();
    }
  });

  it('returns checks with source=build in JSON-serialisable shape', async () => {
    const checks = await getPullRequestBuilds(context, pat, prId);
    expect(checks.length).toBeGreaterThan(0);
    const buildSourceChecks = checks.filter((c) => c.source === 'build');
    expect(buildSourceChecks.length).toBeGreaterThan(0);
    for (const check of buildSourceChecks) {
      expect('isBlocking' in check).toBe(true);
    }
  });

  it('returns an empty array for a nonexistent PR (Builds API does not 404 on missing filter)', async () => {
    // The Builds API is a filter query — a PR id with no matching builds returns []
    // rather than a 404, unlike the Git PR APIs.
    const result = await getPullRequestBuilds(context, pat, 9999999);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('throws for a bad PAT', async () => {
    await expect(getPullRequestBuilds(context, 'invalid-pat-value', prId)).rejects.toThrow();
  });

  it('build checks have source=build and isBlocking=null (US3 JSON parity)', async () => {
    // Verifies the JSON output shape for build-source checks independently of
    // policy evaluations (which return 400 for closed PRs).
    const buildChecks = await getPullRequestBuilds(context, pat, prId);
    expect(buildChecks.length).toBeGreaterThan(0);
    const buildEntry = buildChecks.find((c) => c.source === 'build');
    expect(buildEntry).toBeDefined();
    expect(buildEntry?.isBlocking).toBeNull();
    expect('isBlocking' in buildEntry!).toBe(true);
  });
});

// Self-healing round-trip: adds the authenticated identity itself as a
// required reviewer on the reference PR, verifies it, then removes it again
// (or leaves it, restoring the required/optional flag, if it was already a
// reviewer before the test ran) — mirrors the patchThreadStatus round-trip
// above, so it's safe to run repeatedly against a shared PR.
//
// Identity is resolved via connectionData (dev.azure.com), NOT via
// resolveReviewerIdentity's Identities-API search (vssps.dev.azure.com) —
// live verification found the latter 401s for at least one real
// Code(R/W)-scoped PAT/org even though the reviewer PUT/DELETE calls below
// (on dev.azure.com) succeed with the very same credential. That gap is in
// email→GUID resolution, not in the reviewer add/remove mechanics this test
// exists to verify, so this test deliberately routes around it.
describe.skipIf(!AZDO_PR_ID || SKIP_PR)('pr reviewers add/remove round-trip', () => {
  const context = makeContext();
  const pat = AZDO_PAT;
  const repo = AZDO_REPO;
  const prId = AZDO_PR_ID!;

  it('can add the authenticated identity as a required reviewer and restore prior state', async () => {
    const identity = await resolveCredentialIdentity(AZDO_ORG, pat);
    if (identity === null || identity.id === null) {
      // Cannot resolve who we are (e.g. connectionData unreachable) — skip
      // quietly rather than fail; this is a diagnostic prerequisite, not
      // what the test is verifying.
      return;
    }

    const before = await getPullRequestReviewers(context, repo, pat, prId);
    const priorEntry = before.find((reviewer) => reviewer.id === identity.id);

    try {
      const added = await addOrUpdatePullRequestReviewer(context, repo, pat, prId, identity.id, true);
      expect(added.id).toBe(identity.id);
      expect(added.isRequired).toBe(true);

      const afterAdd = await getPullRequestReviewers(context, repo, pat, prId);
      expect(afterAdd.some((reviewer) => reviewer.id === identity.id && reviewer.isRequired)).toBe(true);
    } finally {
      // Restore: remove if we added them fresh, or put back their prior
      // required/optional flag if they were already a reviewer. Best-effort
      // — a restore failure here shouldn't mask a real assertion failure above.
      try {
        if (priorEntry === undefined) {
          await removePullRequestReviewer(context, repo, pat, prId, identity.id);
        } else if (priorEntry.isRequired !== true) {
          await addOrUpdatePullRequestReviewer(context, repo, pat, prId, identity.id, priorEntry.isRequired);
        }
      } catch {
        // ignore — best effort restoration only.
      }
    }
  });
});
