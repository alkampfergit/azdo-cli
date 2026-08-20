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

## Phase 9: Follow-up round — consumer feedback (2026-08-20)

**Purpose**: act on the report filed by the first real consumer of these commands. Every item was
verified against the current code first; two were already fixed by the work above and were closed
without changes.

- [x] T031 Reproduce the reported "`--dry-run` ignores `--json`" through a real `azdo pr …` tree and
      identify the root cause: options declared on both `pr comments` and its subcommands are stored
      on the parent, so `--pr-number` (wrong PR targeted) and `--json` were both lost in the nested
      form
- [x] T032 Read `mergedPrOptions()` (`optsWithGlobals()`) in the `add` / `edit` / `reply` handlers
- [x] T033 [P] Add `tests/unit/pr-command-tree.test.ts` — nested vs alias parity for `--pr-number`,
      `--json` and `--repo` on all three subcommands
- [x] T034 Build the pull request browser URL in `mapPullRequest()` (context threaded through) so
      `url` is never null; update the three tests that pinned `null`
- [x] T035 [P] Map `createdByUniqueName` / `createdById`, with raw `uniqueName` / `id` on
      `AzdoPullRequest.createdBy`
- [x] T036 [P] Add `--thread <id>` (selector, exit 3 when absent) and `--contains <text>` (literal,
      case-sensitive, matched before truncation) to `pr comments`; name the `matching` filter in the
      "everything filtered out" message
- [x] T037 [P] Return `truncated` / `originalLength` from `truncateContent()` and emit them on every
      comment
- [x] T038 Introduce `EXIT_NOT_FOUND` (3) and `EXIT_NOT_PERMITTED` (4), give `writeError()` an exit
      code parameter, and map every not-found / not-permitted path; leave the 019 C-2/C-3 codes at 1
- [x] T039 [P] Add `tests/unit/pr-exit-codes.test.ts`; update the ten existing expectations that
      asserted exit 1 for those paths
- [x] T040 Remember the resolved credential in `services/auth.ts` and add
      `describeResolvedCredential()`; print it under the scope line on AUTH_FAILED, keeping the first
      line byte-identical
- [x] T041 [P] Add `tests/unit/auth-credential-source.test.ts`; extend every auth mock factory with
      the new export
- [x] T042 [P] Add `resolveCredentialIdentity()` (connectionData) and `identity` to
      `AuthDiagnosticReport` + formatter; skip the lookup when connectivity failed
- [x] T043 [P] Cover the identity path in `tests/unit/auth-diagnostics.test.ts` (mapping, partial
      payload, every failure mode, skip-on-failed-connectivity)
- [x] T044 [P] Document the credential resolution order in `azdo config --help`
- [x] T045 Correct the `comments edit --dry-run` help text to match what it prints
- [x] T046 Docs: exit-code table, JSON field reference and identity block in `docs/commands.md`;
      new flags in `README.md`; `docs/changelogs/unreleased.md` + `CHANGELOG.md`; contract, spec,
      plan, research, data-model and this file
- [x] T047 Run `npm test` (992 unit tests green: typecheck, lint, build, unit, integration)

### Closed without changes

- The report's "the message always says `Code (Read)`" — already fixed by the work above:
  `add` / `edit` / `reply` / `comment-resolve` / `comment-reopen` / `open` report
  `Code (Read & Write)` through `handlePrCommandError(err, context, 'write')`.
- The request to print the current body on `edit --dry-run` — declined; the help text was wrong, not
  the behaviour. `--json` returns `previousContent` for a real diff.

---

## Dependencies & Execution Order

- Phase 2 blocks every later phase.
- US1 (Phase 3) and US2 (Phase 4) share `resolveCommentBody()` and the PR resolver from Phase 2 but are otherwise independent.
- US3 (Phase 5) and US4 (Phase 6) touch different code paths and can run in parallel with each other.
- US5 (Phase 7) touches every command factory, so it lands after the new commands exist to avoid churn.
- T029 (script deletion) lands only after the equivalent commands are green.
- Phase 9 is a follow-up round on the same branch: T032 (option plumbing) comes first because
  the bug can misdirect a write; T033 gates it; the rest are independent of each other.

## Parallel Opportunities

```text
Phase 2: T005, T006, T007, T008 in parallel (independent functions), then T009
Phase 5 and Phase 6 in parallel
Phase 8: T025, T026, T027, T028 in parallel
```

## Notes

- No new runtime dependencies, in either round.
- `--dry-run` is the only affordance without precedent in the repository; see `research.md` §8.
- Existing command output is unchanged when none of the new flags is passed — asserted by the
  "no new flags" regression test in `pr-comments-filters.test.ts`.
- Phase 9 changes two observable behaviours on purpose: `url` is no longer `null`, and failures
  carry exit code 3 / 4 instead of 1. Both were requested; see `spec.md` FR-013 / FR-018.
