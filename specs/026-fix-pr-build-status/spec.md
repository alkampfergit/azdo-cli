# Feature Specification: Fix `azdo pr status` Build/Pipeline Check Retrieval

**Feature Branch**: `026-fix-pr-build-status`  
**Created**: 2026-06-09  
**Status**: Draft  
**Input**: User description: "Anomaly handling pull request status with build — `azdo pr status` shows 'Checks: unable to retrieve (Azure DevOps request failed)' even when pipelines are running on the pull request."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Pipeline Check Status on a PR (Priority: P1)

A developer runs `azdo pr status` for a branch that has an active pull request with one or more pipeline runs (triggered by the PR). Instead of seeing "Checks: unable to retrieve", they see the actual status of each pipeline — running, succeeded, or failed.

**Why this priority**: This is the core broken behaviour. The command claims it cannot retrieve checks but pipeline runs are clearly present. Developers rely on check status to know whether their PR is safe to merge.

**Independent Test**: Run `azdo pr status` against a branch with a known PR that has at least one associated pipeline run (e.g., PR #65). The output must list the pipeline run status instead of reporting an error.

**Acceptance Scenarios**:

1. **Given** a pull request with one or more pipeline runs, **When** the user runs `azdo pr status`, **Then** the Checks section lists each pipeline with its current state (e.g., `- [succeeded] <pipeline name>`) and does NOT show "unable to retrieve".

2. **Given** a pull request with mixed-type checks (policy evaluations AND pipeline runs), **When** the user runs `azdo pr status`, **Then** all checks from all sources are listed together in the Checks section.

3. **Given** a pull request where check retrieval genuinely fails (network error, auth failure), **When** the user runs `azdo pr status`, **Then** the output still shows "Checks: unable to retrieve (<reason>)" — the error message is preserved for real failures.

---

### User Story 2 - Distinguish Optional vs Required Checks (Priority: P2)

A developer sees which pipelines are required (blocking merge) and which are optional (informational). This lets them know whether a failing pipeline will block their PR.

**Why this priority**: The owner mentioned "some optional and some forced pipelines". Distinguishing them is secondary to showing any data at all.

**Independent Test**: Run `azdo pr status` on a PR that has both optional and required pipelines. Output labels or presentation makes the distinction visible.

**Acceptance Scenarios**:

1. **Given** a PR with both required and optional pipeline runs, **When** the user runs `azdo pr status`, **Then** the Checks section indicates which checks are required and which are optional (e.g., an `[optional]` suffix, or a separate `Optional checks:` grouping).

---

### User Story 3 - JSON Output Includes Build Check Data (Priority: P3)

A developer running `azdo pr status --json` gets a JSON output that includes pipeline check details — name, state, and whether the check is required — enabling scripted consumption of check status.

**Why this priority**: JSON consumers need the same data as human-readable output. Keeping parity prevents downstream tooling from silently receiving incomplete data.

**Independent Test**: Run `azdo pr status --json` on a PR with pipeline runs. The `checks` array in the JSON output contains entries for the pipeline runs.

**Acceptance Scenarios**:

1. **Given** a PR with pipeline runs, **When** the user runs `azdo pr status --json`, **Then** the JSON output's `checks` array includes entries with `name`, `state`, and (if available) whether the check is blocking.

---

### Edge Cases

- What happens when the PR has pipeline runs but no branch policy evaluations — checks from pipeline runs should still appear.
- What happens when the PR has no checks of any kind — the existing "Checks: none reported by Azure DevOps" message continues to appear.
- What happens when only some check sources are retrievable — partial results are shown rather than a blanket failure, and only sources that cannot be reached are omitted from the output (degrading gracefully per the existing merge logic).
- What happens on a PR older than the pipelines list (no runs ever triggered) — "none reported" message appears without error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `azdo pr status` MUST display pipeline/build check statuses for a pull request that has associated pipeline runs, even when those runs are not surfaced by the existing statuses and policy-evaluations API calls.

- **FR-002**: The Checks section MUST NOT show "unable to retrieve" when at least one check source successfully returns data, even if another source fails.

- **FR-003**: When all check sources fail to return data, the "unable to retrieve" error message MUST be preserved (no regression on the existing failure-reporting contract).

- **FR-004**: The check retrieval logic MUST handle the case where the project GUID cannot be resolved gracefully — degrading to available sources rather than marking all checks as failed.

- **FR-005**: Optional and required checks MUST be distinguishable in both human-readable and JSON output.

- **FR-006**: Integration tests MUST cover the check-retrieval path using PR #65 (which has one pipeline run) and PR #64 (the existing reference PR) to prevent regression.

### Key Entities

- **Pipeline Check**: A build or pipeline run associated with a pull request, characterised by a name, a current state (pending/running/succeeded/failed/error), and a required/optional flag.
- **Check Source**: An Azure DevOps API endpoint that returns check data for a PR (existing: statuses API, policy evaluations API; potentially new: builds API filtered by PR).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running `azdo pr status` on PR #65 (confirmed to have one pipeline run) produces a Checks section listing at least one entry — zero "unable to retrieve" results.
- **SC-002**: Running `azdo pr status` on any PR that previously showed "Checks: unable to retrieve" but was known to have pipeline runs now shows at least one check entry.
- **SC-003**: Existing `azdo pr status` output format is preserved byte-for-byte for PRs with no checks (no regressions on the empty-checks path).
- **SC-004**: `azdo pr status --json` output for a PR with pipeline runs includes a non-empty `checks` array with correct `state` values.
- **SC-005**: The new integration test covering PR #65 passes consistently in CI.

## Assumptions

- PR #65 has pipeline runs created by an Azure DevOps pipeline mechanism (YAML trigger, build validation policy, or equivalent) that is queryable via the Azure DevOps REST API.
- The fix does not require changes to authentication scope — the existing PAT/OAuth credential used by the CLI is sufficient to query the additional check source.
- "Optional" vs "required" distinction is available from the check source metadata (e.g., `isBlocking` on a policy evaluation or equivalent field on build runs).
