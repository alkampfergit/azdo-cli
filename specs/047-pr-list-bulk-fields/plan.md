# Implementation Plan: Bulk PR ↔ work item read in `azdo pr list`

**Branch**: `feature/047-pr-list-bulk-fields` | **Spec**: [spec.md](./spec.md)

## Technical Context

TypeScript 5.x strict, commander.js, native `fetch`, vitest. No new dependencies.

## Constitution Check

- Grounded in documented Azure DevOps REST 7.1 fields (VI) — PASS; no invented
  `updatedAt`.
- No new command; one opt-in flag on an existing one (III) — PASS.
- Docs in `docs/commands.md`, README untouched — PASS.

## Design

| File | Change |
|------|--------|
| `src/types/pull-request.ts` | `BranchPullRequestMatch` gains optional `isDraft`, `creationDate`, `closedDate`, `reviewers: Reviewer[]`, `labels: string[]`; `AzdoPullRequest` gains the raw fields; new `PullRequestWithWorkItems`, `AzdoResourceRefListResponse`. |
| `src/services/pr-client.ts` | `mapPullRequest` projects the new fields (reviewers via existing `mapReviewer`); new `getPullRequestWorkItemIds()`. |
| `src/commands/pr.ts` | `pr list --work-items`; `attachWorkItemIds` (5-worker pool, order preserved); `parseListOptions` extracted; draft marker and `Work items:` line in text output. |
| tests | `pr-client.test.ts` (mapping, endpoint), `pr-list.test.ts` (flag on/off, order, concurrency cap, auth failure). |
| docs | `docs/commands.md`, `docs/changelogs/unreleased.md`, `AGENTS.md`. |

## Decisions

- `--work-items` is opt-in: it costs one request per PR, and `pr list --branch`
  is used as a cheap single-call lookup.
- Work item failures fail the whole command (no partial list): a silently
  missing link would misclassify a PR as orphaned.
