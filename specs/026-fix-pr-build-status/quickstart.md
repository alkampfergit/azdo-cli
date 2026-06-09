# Quickstart: 026-fix-pr-build-status

## What was wrong

`azdo pr status` displayed `Checks: unable to retrieve (Azure DevOps request failed)` for pull requests that had pipeline runs. The two existing check sources (PR Statuses API + Policy Evaluations API) either failed silently or returned empty results, while the actual pipeline runs were visible in the Azure DevOps UI but not queried.

## What changed

A third check source was added: the Azure DevOps Builds API, filtered by the PR's synthetic merge ref (`refs/pull/{prId}/merge`). All pipeline runs associated with a PR are accessible this way, regardless of whether they were configured as branch policies.

The `PullRequestCheck` type gained `isBlocking` (required vs optional) and the `source` field now includes `'build'`.

## Testing manually

```bash
# Run against a branch with an active PR that has pipeline runs
azdo pr status --org <your-org> --project <your-project>

# Expected: Checks section lists pipeline run(s), NOT "unable to retrieve"
# Example output:
#   Checks:
#   - [succeeded] CI - Build Validation
#   - [pending]   Integration tests [optional]
#   Code comments: 0 open, 0 closed

# JSON output
azdo pr status --json | jq '.pullRequests[0].checks'
# Expected: array with at least one entry including name, state, source, isBlocking
```

## Integration test (PR #65)

Set the environment variable and run:

```bash
export AZDO_PR_ID_WITH_BUILDS=65
npm run test:integration -- --reporter=verbose tests/integration/pull-requests.test.ts
```

## Key files changed

| File | Change |
|---|---|
| `src/types/pull-request.ts` | `PullRequestCheck.isBlocking`, `PullRequestCheck.source` extended, `AzdoPolicyEvaluation.context` added |
| `src/types/pipeline.ts` | `AzdoBuild.definition.name` added |
| `src/services/pr-client.ts` | `getPullRequestBuilds()` added; `mapPolicyEvaluationCheck` exposes `isBlocking`; `getPullRequestPolicyEvaluations` now also returns raw evaluations for dedup |
| `src/commands/pr.ts` | `buildPullRequestStatusEntry` calls third source; formatter shows `[optional]` tag |
| `tests/integration/helpers/integration-utils.ts` | `AZDO_PR_ID_WITH_BUILDS` env var added |
| `tests/integration/pull-requests.test.ts` | New test suite for `getPullRequestBuilds` |
