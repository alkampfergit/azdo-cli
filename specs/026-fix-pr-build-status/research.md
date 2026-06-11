# Research: Fix `azdo pr status` Build/Pipeline Check Retrieval

**Date**: 2026-06-09
**Feature**: 026-fix-pr-build-status

---

## R1: Why does "unable to retrieve" appear when pipelines are running?

**Decision**: The error fires when at least one check source fails AND the combined check list is empty. The most common cause is that `resolveProjectId` (the projects API call needed to build the policy-evaluation artifact ID) fails silently, setting `policyOk = false` — and if the PR Statuses API also returns an empty list, the combined result is zero checks with a source failure, triggering the error message.

**Additionally**: builds triggered by a PR via a YAML pipeline or build validation policy appear in the Azure DevOps Builds API under the `refs/pull/{prId}/merge` merge ref, but the current implementation does NOT query this endpoint. These builds never surface in `pr status` regardless of whether the policy evaluations API is working.

**Rationale**: Adding the Builds API as a third source directly fixes the "unable to retrieve" case (if the builds call succeeds, `checks.length > 0` and no error is shown), while also covering the gap where builds exist but policy evaluations return nothing.

**Alternatives considered**:
1. Only fix the policy evaluations failure mode (e.g. better error handling for `resolveProjectId`). Rejected: still misses builds that are not branch policies.
2. Replace policy evaluations with a builds-only approach. Rejected: loses the `isBlocking` (required/optional) metadata that only the policy API carries.

---

## R2: Azure DevOps Builds API — filter by PR

**Decision**: Use the Builds API with `branchName=refs/pull/{prId}/merge` to retrieve all builds associated with a specific PR.

**Endpoint**:
```
GET https://dev.azure.com/{org}/{project}/_apis/build/builds
    ?branchName=refs/pull/{prId}/merge
    &queryOrder=queueTimeDescending
    &$top=50
    &api-version=7.1
```

**Key response fields per `Build` object**:

| Field | Type | Notes |
|---|---|---|
| `id` | int | Build run ID |
| `definition.id` / `definition.name` | object | Pipeline name for display |
| `status` | string | `notStarted`, `inProgress`, `completed` (and others) |
| `result` | string | `succeeded`, `partiallySucceeded`, `failed`, `canceled` (only set when status=completed) |
| `sourceBranch` | string | Will be `refs/pull/{prId}/merge` |
| `_links.web.href` | string | Link to the build run in the ADO UI |
| `queueTime` | string | When the build was queued |

**State mapping** (`AzdoBuild` → `PullRequestCheck.state`):

| `status` | `result` | Mapped state |
|---|---|---|
| `notStarted`, `postponed` | any | `pending` |
| `inProgress`, `cancelling` | any | `pending` |
| `completed` | `succeeded` | `succeeded` |
| `completed` | `partiallySucceeded` | `succeeded` |
| `completed` | `failed` | `failed` |
| `completed` | `canceled` | `error` |
| `completed` | `none` / missing | `pending` |
| anything else | anything else | pass through verbatim |

**Auth scope required**: `vso.build` (Build read) — already implied by the `azdo pipeline` commands, which use the same Builds API.

**Rationale**: The existing `getPipelineRuns` function in `pipeline-client.ts` already uses `refs/pull/${prNumber}/merge` successfully. This confirms the pattern works in the project. The `pr-client.ts` gets a new parallel function (`getPullRequestBuilds`) so the PR service boundary stays cohesive.

**Alternatives considered**:
1. Use `reasonFilter=pullRequest` as an additional filter. Rejected for now — the PR merge-ref filter is already specific enough. Adding `reasonFilter` would also exclude any manual re-runs of the build triggered for the same PR branch, which developers expect to see.

---

## R3: Azure DevOps Policy Evaluations API — `isBlocking` field

**Decision**: Expose `configuration.isBlocking` from `AzdoPolicyEvaluation` in the mapped `PullRequestCheck` to fulfil FR-005 (optional vs required distinction). This field is already present in the existing type definition.

**Endpoint** (unchanged):
```
GET https://dev.azure.com/{org}/{project}/_apis/policy/evaluations
    ?artifactId=vstfs:///CodeReview/CodeReviewId/{projectId}/{prId}
    &api-version=7.1-preview.1
```

**Key field for required/optional**:
- `configuration.isBlocking` — `true` = required (merge-blocking), `false` = optional/informational

**Auth scope**: `vso.code`

**Rationale**: The type `AzdoPolicyEvaluation` already has `configuration.isBlocking?: boolean`. The mapping function `mapPolicyEvaluationCheck` in `pr-client.ts` simply needs to pass it through to the `PullRequestCheck` object.

---

## R4: Deduplication between builds API and policy evaluations API

**Decision**: Deduplicate by extending `AzdoPolicyEvaluation` with the `context.buildId` link. When a policy evaluation points to a specific build ID, that build is excluded from the builds API results — the policy evaluation record is preferred because it carries `isBlocking`.

**Detail**: `AzdoPolicyEvaluation` response can include a `context` object with a `buildId` field. Collect those IDs after mapping policy evaluations, and filter the builds list to exclude any build whose ID appears in that set.

**Rationale**: Without deduplication, a build associated with a build-validation policy would appear twice: once as `- [succeeded] Policy display name` (from policy evaluations) and once as `- [succeeded] Pipeline definition name` (from the builds API). Deduplication keeps the list clean.

**Alternatives considered**:
1. Show both entries (no dedup). Rejected: creates confusing duplicate lines for the same run.
2. Skip policy evaluations entirely and rely on builds API only. Rejected: loses `isBlocking` metadata.

---

## R5: `PullRequestCheck` type extension — `isBlocking` field

**Decision**: Add `isBlocking?: boolean | null` to `PullRequestCheck`. The formatter shows `[optional]` when `isBlocking === false`; when `true` or `null`/`undefined`, no tag is added (required is the default assumption, and builds API entries have no policy info).

**Source attribution**: Extend `source` union to include `'build'` for checks sourced from the Builds API.

**Rationale**: Adding an optional field with a null default is backward-compatible. JSON consumers that don't recognise `isBlocking` simply ignore it; human output only adds a suffix when the field is explicitly `false`.

---

## R6: Integration test environment variable

**Decision**: Introduce `AZDO_PR_ID_WITH_BUILDS` as a new optional integration test env var alongside `AZDO_PR_ID`. PR #65 (which the owner confirmed has one pipeline run) is the canonical value. Tests skip gracefully when the variable is absent.

**Rationale**: PR #64 is already established as the reference PR for comment/thread tests and must not be repurposed. PR #65 may not always have active pipeline runs (runs expire or complete), so the test can assert "at least one check was returned OR the command did not report 'unable to retrieve'" rather than asserting specific run states.

**Alternatives considered**:
1. Reuse `AZDO_PR_ID` with PR #65. Rejected: PR #64 anchors many existing tests; changing it would invalidate those tests.
2. Hardcode PR #65. Rejected: against the project's pattern of env-var-driven integration tests.

---

## Autonomous Decisions

- New function `getPullRequestBuilds` goes in `src/services/pr-client.ts` (not `pipeline-client.ts`) because it is a PR-context retrieval function accessed only by `pr status`, maintaining the service boundary.
- `definition.name` needs to be added to `AzdoBuild` (currently missing). The type already has `definition?: { id?: number }` from other uses; name is just an additional field.
- The `context` field (`{ buildId?: number }`) needs to be added to `AzdoPolicyEvaluation` for deduplication.
- `$top=50` for the builds API call — covers all realistic PR check counts while bounding API response size.
