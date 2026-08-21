# PR Report: PR Work Item Links, Reviewer Management, and Template-Aware Creation

**Branch**: `034-pr-link-review`
**Date**: 2026-08-21
**Spec**: [specs/034-pr-link-review/spec.md](specs/034-pr-link-review/spec.md)

## Summary

The `azdo pr` command was missing three capabilities operators asked for: linking/unlinking a work item to a pull request, adding or removing required/optional reviewers, and pre-filling a new pull request's description from a repository-defined template. This feature adds all three as thin additions to the existing `pr` command surface, with no new dependencies.

## What's New

- **Work item links** (`pr work-items link|unlink <workItemId>`): links or unlinks a work item to/from a pull request by adding/removing an `ArtifactLink` relation on the work item — the same mechanism the Azure DevOps web UI uses. Idempotent in both directions; a nonexistent work item id fails with exit `3`.
- **Reviewer management** (`pr reviewers add|remove <reviewer>`): adds a reviewer (optional by default, `--required` for required) or removes one, resolving the supplied email/unique name to an Azure DevOps identity GUID first. Re-adding an existing reviewer with a different `--required` value updates them in place rather than duplicating; an unresolvable identity fails with exit `1` naming the input.
- **Template-aware `pr open`**: `--description` is now optional. When omitted, the command searches for a repository-defined pull request template using Azure DevOps's own convention (`pull_request_template[/branches/<branch>].md` under `.azuredevops/`, `.vsts/`, `docs/`, or the repo root, always read from the default branch, with multi-level branch fallback). When both `--description` and a template are present, the description is the supplied text followed by the template content; with neither, `pr open` fails exactly as it did before.
- **Command surface**: two new command groups, `pr work-items` and `pr reviewers`, following the existing `pr comments` pattern (shared `--org`/`--project`/`--repo`/`--pr-number`/`--json`, the same `mergedPrOptions` nested-option-plumbing fix already used by `pr comments add|edit|reply`).

## New Libraries / Dependencies

None — reuses `commander.js`, native `fetch`, and the existing `fetchWithErrors`/`authHeaders`/`resolvePullRequestTarget` helpers.

## Testing

- **Unit**: new `tests/unit/pr-client.test.ts` coverage for `resolveRepositoryId`, `getWorkItemRelations`, `linkWorkItemToPullRequest`/`unlinkWorkItemFromPullRequest` (happy path + both no-op directions + 404), `resolveReviewerIdentity` (single/zero/ambiguous matches), `addOrUpdatePullRequestReviewer`/`getPullRequestReviewers`/`removePullRequestReviewer` (add, promote-in-place, remove, no-op), and `resolvePullRequestTemplate` (branch-specific, multi-level fallback, default fallback, not-found). Also extended the existing `openPullRequest` tests for template composition and the new `DESCRIPTION_REQUIRED` path.
- **Unit (real command tree)**: extended `tests/unit/pr-command-tree.test.ts` with `pr work-items link|unlink` and `pr reviewers add|remove` driven through the actual `azdo pr` command tree (not the isolated factory), covering `--org`/`--project`/`--repo`/`--pr-number`/`--json` plumbing and the invalid-id / unresolvable-identity error paths — the isolated-factory suites can't see nested-option-loss regressions like the one fixed in #81/033.
- **Unit**: updated `tests/unit/pr-open.test.ts` for the now-optional `--description`.
- **Integration (live Azure DevOps)**: new self-healing round-trip in `tests/integration/pull-requests.test.ts` — adds the authenticated identity as a required reviewer on the reference PR, verifies it, then restores prior state. Ran against the real test org/project; confirmed `getPullRequestReviewers` / `addOrUpdatePullRequestReviewer` / `removePullRequestReviewer` all work end-to-end, including the promote-in-place and no-op cases.
- **Manual (live CLI, real ADO project)**: `pr work-items link|unlink` exercised end-to-end via the built binary against the reference PR/work item — link, re-link (noop), unlink, re-unlink (noop) all behaved exactly as designed.
- Full suite: `npm run lint && npm run typecheck && npm run build && vitest run tests/unit tests/integration` — 1142 passed, 7 skipped, 0 failed.

## Notes

- **T027 (manual verification) is now done**, using this environment's live Azure DevOps test credentials: work-item link/unlink verified via the CLI binary against a real PR/work item (including both no-op cases); reviewer add/remove/promote/no-op verified via a new integration test. `pr open`'s template path was **not** exercised against a live create — creating a real PR isn't reversible the way link/unlink and reviewer add/remove are, and the test org's repo has no `pull_request_template*.md` committed to try it against; `resolvePullRequestTemplate` and the description-composition logic are covered by unit tests instead.
- **Real-world limitation found while doing the above**: `resolveReviewerIdentity`'s Identities-API call (`vssps.dev.azure.com/{org}/_apis/identities`) returned `401` against the live test org, even though the very same PAT succeeds on every `dev.azure.com` call this feature makes (Git, Work Item Tracking, and the reviewer PUT/DELETE itself, confirmed by calling it directly with a GUID). `vssps.dev.azure.com` appears to sit behind a separate authorization boundary that this org's PAT doesn't clear, independent of the "Code (Read & Write)" scope the PAT does have. Net effect: `pr reviewers add|remove <email>` may fail with an auth error in some orgs even when the identity is a valid reviewer and the PAT is otherwise fully scoped — the failure is in email→GUID resolution, not in the add/remove mechanics. Documented in docs/commands.md. A follow-up could try the newer Graph API (`_apis/graph/users`) as an alternative resolution path if this proves common; out of scope for this PR since it needs its own research pass and doesn't block anything already merged.
- Reviewer add/remove PUT/DELETE mechanics use the standard `dev.azure.com/.../pullRequests/{id}/reviewers/{reviewerId}` endpoint — this is the same mechanism `az repos pr reviewer add` uses under the hood, per research.md, and is unaffected by the Identities-API finding above.
- Pull request templates are always read from the repository's **default** branch, never the PR's source or target branch — this is an Azure DevOps platform rule, not a choice made here (see research.md §3).
- Fixed a pre-existing, unrelated bug found while building the reviewer integration test: `resolveCredentialIdentity` (used by `azdo auth diagnose`) called `connectionData` with `api-version=7.1` instead of the required `api-version=7.1-preview`, so it always 400'd and silently returned `null` — `auth diagnose --json` always reported `identity: null`. Fixed with a regression-guarding unit test (`docs/changelogs/unreleased.md`).
