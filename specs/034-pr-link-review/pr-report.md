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
- Full suite: `npm run lint && npm run typecheck && npm run build && vitest run tests/unit tests/integration` — 1136 passed, 7 skipped (integration tests require live `AZDO_*` credentials), 0 failed.

## Notes

- **Manual verification pending** (tasks.md T027): running the quickstart.md checklist against a real Azure DevOps project/PAT — this environment has no live ADO credentials to do that against. Recommend the reviewer (or CI's integration job, if credentials are configured there) exercise `pr work-items link`, `pr reviewers add --required`, and `pr open` against a repo with a real `docs/pull_request_template/branches/<branch>.md` before merge.
- Reviewer identity resolution uses the legacy Identities API (`vssps.dev.azure.com/.../_apis/identities`); this is the same mechanism `az repos pr reviewer add` uses under the hood and works for both AAD-backed and legacy identities, per research.md.
- Pull request templates are always read from the repository's **default** branch, never the PR's source or target branch — this is an Azure DevOps platform rule, not a choice made here (see research.md §3).
