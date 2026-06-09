# PR Report: Fix `azdo pr status` Build/Pipeline Check Retrieval

**Branch**: `026-fix-pr-build-status`
**Date**: 2026-06-09
**Spec**: [specs/026-fix-pr-build-status/spec.md](specs/026-fix-pr-build-status/spec.md)

## Summary

`azdo pr status` was showing "Checks: unable to retrieve (Azure DevOps request failed)" for pull requests that had active pipeline runs. This fix adds the Azure DevOps Builds API as a third check source (alongside the existing PR Statuses and Policy Evaluations sources), so pipeline runs associated with a PR are always visible. It also exposes the required/optional distinction for policy-based checks and adds integration test coverage for a PR with known pipeline runs.

## What's New

<!-- Filled in by /speckit-implement after all tasks complete -->

- **[PLACEHOLDER]**: [What was added or changed and why]

## Testing

<!-- Filled in by /speckit-implement after all tasks complete -->

- **[PLACEHOLDER]**: [Test type and coverage]

## Notes

- The deduplication mechanism (excluding Builds API entries that are already covered by a linked policy evaluation) is described in the design docs but is **not** implemented in this PR — it is a non-blocking follow-up. In practice, a build validation policy check and a raw build entry have different display names and will not look like duplicates in the output.
- `isBlocking: null` for build-source checks is intentional — the Builds API has no policy blocking metadata. Only policy-evaluation-source checks carry `true`/`false`.
