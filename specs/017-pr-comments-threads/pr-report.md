# PR Report: Reliable access and management of PR comment threads

**Branch**: `017-pr-comments-threads`
**Date**: 2026-04-23
**Spec**: [specs/017-pr-comments-threads/spec.md](./spec.md)

## Summary

Fixes the `azdo pr comments` crash reported in #34, where the command failed
with `Cannot read properties of undefined (reading 'web')` (plus a libuv
async-handle assertion on Windows pwsh) and left operators unable to read PR
discussion from the CLI. The same iteration adds a `--pr-number <N>` flag so
any PR can be targeted without checking out its branch, and introduces
`azdo pr comment-resolve` / `azdo pr comment-reopen` subcommands for
triaging thread state from the terminal.

## What's New

<!-- Final list will be filled in during PR-report finalisation (step 11). Placeholders below reflect the approved plan so reviewers can see the scope. -->

- **[PR read path]**: placeholder — populated after `/speckit-implement` lands.
- **[`--pr-number` flag]**: placeholder.
- **[Resolve / reopen subcommands]**: placeholder.
- **[Integration tests]**: placeholder.

## New Libraries / Dependencies

None planned — the feature intentionally stays inside the existing stack (TypeScript 5.x strict, commander.js, native `fetch`, `node:child_process`). This section will be removed in step 11 if it remains empty.

## Breaking Changes

None planned for external CLI consumers. The `ActiveCommentThread.status` field widens from `"active" | "pending"` to the full Azure DevOps thread-state enum (`"unknown" | "active" | "fixed" | "wontFix" | "closed" | "byDesign" | "pending"`), and `BranchPullRequestMatch.url` widens from `string` to `string | null` — both changes are safer type declarations that match what the backend actually returns, and existing consumers either don't inspect these fields or format them as strings. Finalised in step 11.

## Testing

<!-- Final list will be filled in during PR-report finalisation (step 11). Placeholders reflect the approved plan. -->

- **[Unit]**: placeholder.
- **[Integration]**: placeholder.
- **[Manual]**: placeholder.

## Notes

- Closes #34.
- Tagging and release cuts are explicitly out of scope for this PR — gitflow-owned via a separate `release/*` flow.
- README update is queued as task T022 in `tasks.md` per the constitution's Development Workflow section.
