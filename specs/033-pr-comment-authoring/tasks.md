# Tasks: PR Comment Authoring & Pull Request Lookup

**Input**: Design documents from `/specs/033-pr-comment-authoring/`  
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no shared-state dependencies)
- **[Story]**: User story this task belongs to (US1–US5)

---

## Phase 1: Setup

**Purpose**: No new project or dependency setup (existing TypeScript/commander.js project, no new runtime deps).

- [x] T001 Confirm the working tree is clean and `npm install` leaves the lockfile unchanged

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Types, transport functions, and shared command helpers every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 Add `CreatableThreadStatus` and `PullRequestThreadCreateRequest` to `src/types/pull-request.ts`; add `description` to `BranchPullRequestMatch` / `AzdoPullRequest` and `commentType` to `ActivePullRequestComment` / `AzdoComment` (per `data-model.md`)
- [x] T003 Map the two new fields in `src/services/pr-client.ts` — `description` (trimmed, `null` when absent) in `mapPullRequest()`, `commentType` in `mapComment()`
- [x] T004 Generalise `buildPullRequestsUrl()` in `src/services/pr-client.ts` to accept `string | null` for the source branch plus an optional `$top`
- [x] T005 [P] Add `createPullRequestThread()` to `src/services/pr-client.ts` — `POST .../threads`, status key emitted only when requested, response mapped via `toActiveCommentThread()`
- [x] T006 [P] Add `updateThreadComment()` to `src/services/pr-client.ts` — `PATCH .../threads/{t}/comments/{c}`, response mapped to `PostedPrComment`
- [x] T007 [P] Add `getPullRequestThread()` to `src/services/pr-client.ts` — single-thread `GET`
- [x] T008 [P] Add `listRepositoryPullRequests()` to `src/services/pr-client.ts` — repo-wide listing with optional branch/status/top
- [x] T009 [P] Cover T005–T008 plus the new field mapping in `tests/unit/pr-client.test.ts` (success, 401, 403, 404, URL shape); update the existing `toEqual` expectations for the two additive fields
- [x] T010 Add the shared command helpers in `src/commands/pr.ts`: `withCommonPrOptions()` (`--org`/`--project`/`--repo`), `resolveCommentBody()` (inline XOR `--file`, non-empty), `parseNonNegativeInt()`, `truncateContent()`
- [x] T011 Split `resolvePullRequestTarget()` out of `resolveThreadTarget()` in `src/commands/pr.ts`, preserving the existing validation order and error strings

**Checkpoint**: transport and helpers are tested — command work can begin.

---

## Phase 3: User Story 1 — Post a new comment thread (P1) 🎯 MVP

- [x] T012 [US1] Add `runCommentAdd()` in `src/commands/pr.ts` — resolve body, validate `--status`, resolve the PR, handle `--dry-run`, POST, print/emit the result
- [x] T013 [US1] Add `buildCommentAddCommand()` plus `createPrCommentsAddCommand()` / `createPrCommentAddCommand()`; register under `pr comments` and on `pr`
- [x] T014 [US1] Command tests in `tests/unit/pr-comment-authoring.test.ts` — inline body, `--file`, `--status` valid/invalid, both-inputs rejection, empty/whitespace body, missing file, `--dry-run` (text + JSON), `--json`, branch auto-detection, zero-match, `--repo`, auth mapping, alias parity

**Checkpoint**: US1 is independently usable.

---

## Phase 4: User Story 2 — Correct a comment already posted (P1)

- [x] T015 [US2] Add `runCommentEdit()` in `src/commands/pr.ts` — validate `--comment-id`, resolve the thread, pick the target comment (first by default), handle `--dry-run`, PATCH, print/emit the result
- [x] T016 [US2] Add `buildCommentEditCommand()` plus `createPrCommentsEditCommand()` / `createPrCommentEditCommand()`; register both
- [x] T017 [US2] Command tests in `tests/unit/pr-comment-authoring.test.ts` — default first comment, `--comment-id`, invalid/absent comment id, thread not found, invalid thread id, `--file`, `--dry-run`, `--json` with `previousContent`, 403 mapping, alias parity

**Checkpoint**: the post → correct loop works end to end.

---

## Phase 5: User Story 3 — Read a discussion compactly (P2)

- [x] T018 [US3] Add `shapeThreadForOutput()` and wire `--exclude-system` / `--max-chars` into `createPrCommentsCommand()`, including the filter names in the "everything filtered out" message
- [x] T019 [US3] Tests in `tests/unit/pr-comments-filters.test.ts` — default unchanged, system-only thread dropped, mixed thread stripped, truncation marker, `0` = no limit, invalid values

---

## Phase 6: User Story 4 — Find the pull request for a branch (P2)

- [x] T020 [US4] Add `createPrListCommand()` in `src/commands/pr.ts` — validate `--status`/`--top`, strip a `refs/heads/` prefix, one call, human + JSON output; register on `pr`
- [x] T021 [US4] Tests in `tests/unit/pr-list.test.ts` — default listing without branch resolution, branch filter, each status, invalid status/top, `--repo`, empty result, `--json`, auth mapping

---

## Phase 7: User Story 5 — `--repo` across the group (P3)

- [x] T022 [US5] Apply `withCommonPrOptions()` to `status`, `open`, `comments`, `comment-resolve`, `comment-reopen`, reply/add/edit and their aliases, and `list`; skip `detectRepoName()` when `--repo` is given
- [x] T023 [US5] Assert the `--repo` path in the comments, reply, authoring, and list suites

---

## Phase 8: Polish & Cross-Cutting

- [x] T024 Add `--file` to `pr comments reply` / `pr comment-reply` (argument becomes optional), keeping the 029 empty-body wording
- [x] T025 [P] Add `tests/unit/pr-comment-reply.test.ts` — the reply command had no command-level coverage before
- [x] T026 [P] Update `docs/commands.md` and `README.md` with the new commands and flags
- [x] T027 [P] Record the change in `docs/changelogs/unreleased.md`
- [x] T028 [P] Update `AGENTS.md` and `CLAUDE.md` recent-changes memory
- [x] T029 Delete `scripts/add_pr_comment.ps1`, `scripts/update_pr_comment.ps1`, `scripts/get_pr_comments.ps1`, `scripts/find_pr_for_branch.ps1`
- [x] T030 Run `npm test` (typecheck + lint + build + unit + integration)

---

## Dependencies & Execution Order

- Phase 2 blocks every later phase.
- US1 (Phase 3) and US2 (Phase 4) share `resolveCommentBody()` and the PR resolver from Phase 2 but are otherwise independent.
- US3 (Phase 5) and US4 (Phase 6) touch different code paths and can run in parallel with each other.
- US5 (Phase 7) touches every command factory, so it lands after the new commands exist to avoid churn.
- T029 (script deletion) lands only after the equivalent commands are green.

## Parallel Opportunities

```text
Phase 2: T005, T006, T007, T008 in parallel (independent functions), then T009
Phase 5 and Phase 6 in parallel
Phase 8: T025, T026, T027, T028 in parallel
```

## Notes

- No new runtime dependencies.
- `--dry-run` is the only affordance without precedent in the repository; see `research.md` §8.
- Existing command output is unchanged when none of the new flags is passed — asserted by the
  "no new flags" regression test in `pr-comments-filters.test.ts`.
