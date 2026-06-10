# PR Report: Fix `azdo pr status` Build/Pipeline Check Retrieval

**Branch**: `026-fix-pr-build-status`
**Date**: 2026-06-09
**Spec**: [specs/026-fix-pr-build-status/spec.md](specs/026-fix-pr-build-status/spec.md)

## Summary

`azdo pr status` was showing "Checks: unable to retrieve (Azure DevOps request failed)" for pull requests that had active pipeline runs. This fix adds the Azure DevOps Builds API as a third check source (alongside the existing PR Statuses and Policy Evaluations sources), so pipeline runs associated with a PR are always visible. It also exposes the required/optional distinction for policy-based checks and adds integration test coverage for a PR with known pipeline runs.

## What's New

- **Builds API as third check source** (`src/services/pr-client.ts`): New `getPullRequestBuilds()` function queries `GET /_apis/build/builds?branchName=refs/pull/{prId}/merge` to retrieve all pipeline runs on a PR's synthetic merge ref — the same data the Azure DevOps UI shows. Results appear alongside the existing Status and Policy Evaluations sources.
- **`checksError` condition updated** (`src/commands/pr.ts`): The "unable to retrieve" error now fires only when all three sources fail and nothing was collected. Previously it fired when only two sources failed, suppressing valid results from a third source that didn't yet exist.
- **`[optional]` tag for non-blocking policy checks** (`src/commands/pr.ts`): Human output appends ` [optional]` to check lines where the policy evaluation has `isBlocking === false`. Required checks and build-source checks are unchanged.
- **`isBlocking` field on `PullRequestCheck`** (`src/types/pull-request.ts`): New optional `isBlocking?: boolean | null` field. Policy-source checks carry `true`/`false`; build-source and status-source checks carry `null`.
- **`source: 'build'` union member** (`src/types/pull-request.ts`): Extended the `source` discriminator so consumers can identify build-API-origin checks in JSON output.
- **`definition.name` on `AzdoBuild`** (`src/types/pipeline.ts`): Added to the existing type so the build's pipeline definition name can be used as the check display name.

## Testing

- **Unit: `pr-client.test.ts`** — Updated `getPullRequestPolicyEvaluations` snapshot to include the new `isBlocking` field.
- **Unit: `pr-status.test.ts`** — Added `getPullRequestBuilds` to the mock factory and `beforeEach` default (returns `[]`), ensuring existing status command tests are unaffected.
- **Integration: `pull-requests.test.ts`** — New `describe('getPullRequestBuilds')` block (5 tests) guarded by `AZDO_PR_ID_WITH_BUILDS`. Asserts shape, `source === 'build'`, `isBlocking === null`, error handling for bad PAT, and JSON parity with combined policy+build checks. Run with `AZDO_PR_ID_WITH_BUILDS=65 npm run test:integration`.
- **Build & lint**: `npm run build` (tsc strict), `npm run lint` (ESLint 0 errors), `npm test` (883 passing, 1 pre-existing integration failure unrelated to this change).

## Notes

- The deduplication mechanism (excluding Builds API entries that are already covered by a linked policy evaluation) is described in the design docs but is **not** implemented in this PR — it is a non-blocking follow-up. In practice, a build validation policy check and a raw build entry have different display names and will not look like duplicates in the output.
- `isBlocking: null` for build-source checks is intentional — the Builds API has no policy blocking metadata. Only policy-evaluation-source checks carry `true`/`false`.
