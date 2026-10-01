# Implementation Plan: `pr status` for an arbitrary PR or branch

**Branch**: `feature/047-pr-status-target` | **Spec**: [spec.md](./spec.md)

## Technical Context

TypeScript 5.x strict, commander.js, vitest. No new dependencies. Azure DevOps
APIs already used (Principle VI): Pull Requests - Get Pull Request By Id
(`GET …/pullRequests/{id}`) and Get Pull Requests with
`searchCriteria.sourceRefName` — both already wrapped by `getPullRequestById()`
and `listPullRequests()`.

## Constitution Check

- CLI-first, options on an existing command, no new subcommand — PASS (I, III).
- Reuses the existing resolver pieces (`parseTargetPrNumber`, `fetchTargetById`,
  `resolvePrCommandContext({ requireBranch })`) — no new abstraction — PASS (V).
- Docs in `docs/commands.md`, README untouched — PASS (VII).

## Design

| File | Change |
|------|--------|
| `src/commands/pr.ts` | `StatusTarget` union; `parseStatusTarget()` (exclusivity, empty branch, number validation — all pre-network); `findStatusPullRequests()` (by id via `fetchTargetById`, by branch via `listPullRequests`; explicit empty branch → exit 1); `createPrStatusCommand` gains the two options with its own help strings and only reads the git branch for the default target. |
| `tests/unit/pr-status.test.ts` | New describe covering both options, JSON shape, unknown targets, validation, exclusivity, default unchanged, help. |
| `docs/commands.md`, `docs/changelogs/unreleased.md`, `AGENTS.md` | Entries. |
