# Research: Pull Request Status Checks

**Date**: 2026-03-31
**Feature**: 011-pr-status-checks

## R1: Which Azure DevOps API best matches "checks" for `pr status`

**Decision**: Use the Azure DevOps Git pull request statuses API for pull request checks.

**Rationale**: Microsoft Learn documents a dedicated pull request statuses endpoint for Azure DevOps Git that returns per-check state, context, description, and target URL for a pull request. This fits the existing `pr` command service boundary and directly supports the user's request for returned status plus possible error details.

**Alternatives considered**:
1. Use Policy Evaluations. Rejected for this slice because it expands into policy artifact resolution and a broader "checks" model than the current Git-based PR service needs.
2. Parse check data from the web URL or HTML. Rejected because the repo already uses REST APIs and this would be brittle.
3. Add a separate command for checks. Rejected because the user asked for `pr status` to return the data.

## R2: Where to source error details

**Decision**: Use the Azure DevOps pull request status `description` field as the primary error-detail field and expose it whenever present.

**Rationale**: The official Git pull request statuses API defines `description` as the status description, and this is the most stable documented field for human-readable detail across succeeded, pending, failed, and error states.

**Alternatives considered**:
1. Infer error detail from `targetUrl`. Rejected because a URL is a link, not detail text.
2. Inspect undocumented properties payloads for extra text. Rejected because the repo should not depend on undocumented response shapes for the primary feature contract.

## R3: How to model checks in the existing codebase

**Decision**: Add a dedicated `getPullRequestChecks()` helper in `src/services/pr-client.ts` and use a status-only enriched pull request shape for `azdo pr status`.

**Rationale**: `pr open` and `pr comments` do not need check data. Fetching checks only from `pr status` keeps those other command paths unchanged and avoids unnecessary API calls while still returning a `checks` array in the status result.

**Alternatives considered**:
1. Return a separate map keyed by pull request ID. Rejected because it complicates text formatting and JSON consumption without reducing code.
2. Add a new `pr-checks-client.ts`. Rejected because the feature stays inside the existing pull request service boundary.

## R4: Which checks to include by default

**Decision**: Include returned pull request statuses except `notApplicable` and `notSet`.

**Rationale**: The useful operational states are `pending`, `succeeded`, `failed`, and `error`. `notApplicable` and `notSet` do not represent actionable checks and would mostly add noise.

**Alternatives considered**:
1. Return every status unfiltered. Rejected because it would clutter output with non-meaningful states.
2. Return only pending/failed/error. Rejected because successful checks provide valuable completion context and should stay visible.

## R5: How to represent check names in CLI output

**Decision**: Build a display name from Azure DevOps status context using `genre/name` when both are present, otherwise fall back to the available context field or a generic label.

**Rationale**: The statuses API identifies a status through `context.genre` and `context.name`. Combining them produces a stable, readable label without inventing repository-specific aliases.

**Alternatives considered**:
1. Show only `name`. Rejected because different tools can reuse names and `genre` adds helpful source context.
2. Show raw JSON context in text mode. Rejected because it is noisy for terminal use.

## Autonomous Decisions

- Chose the existing numeric feature-branch convention (`011-pr-status-checks`) over a `feature/` prefix because the repo scripts and prior specs use numeric prefixes.
- Chose the Git pull request statuses API over policy evaluations because it is the narrowest documented Azure DevOps API that directly returns per-check state and description for pull requests.
- Chose a dedicated `getPullRequestChecks()` helper instead of changing every pull request read path because only `pr status` needs this extra data.
