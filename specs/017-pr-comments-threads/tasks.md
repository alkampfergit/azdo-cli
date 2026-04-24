---

description: "Task list for feature 017-pr-comments-threads"
---

# Tasks: Reliable access and management of PR comment threads

**Input**: Design documents in `specs/017-pr-comments-threads/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included — the feature spec requires them (FR-013, FR-014, FR-015 integration; also a standing constitution expectation that lint/typecheck/build stay green with tests).

**Organization**: Tasks grouped by user story. The three user stories from spec.md (US1 = stop the crash + status indicator + hide-resolved filter, US2 = `--pr-number`, US3 = resolve/reopen) are independently testable on top of a shared foundational phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- Include exact file paths in descriptions

## Path Conventions

Single project: `src/` and `tests/` at repository root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline sanity; the repository is already initialised (package.json, tsconfig, eslint, prettier, tsup, vitest are all in place).

- [X] T001 Confirm baseline: run `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` on branch `017-pr-comments-threads` and record that they're green before any code edits. No code changes in this task.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared type / helper / exit-handling changes that every user story depends on. Nothing story-specific lands here.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Relax `AzdoPullRequest._links` to optional in the type definition (likely in `src/types/pr.ts` or co-located with the existing `AzdoPullRequest` declaration — grep `_links:` under `src/` to locate), and update `mapPullRequest` in `src/services/pr-client.ts:49-60` to optional-chain the dereference (`pullRequest._links?.web?.href ?? null`), widening `BranchPullRequestMatch.url` to `string | null`. Adjust any existing consumer of `.url` (`formatPullRequestInfo` and similar in `src/commands/pr.ts`) to render null as `—`.
- [X] T003 [P] Refactor the error-exit path in `src/commands/pr.ts` (`writeError`, `handlePrCommandError`) to set `process.exitCode = 1` and return / throw a typed CLI error, instead of calling `process.exit(1)` synchronously. Goal: no synchronous `process.exit()` from inside an async `.action()` handler, so stdout/stderr drain cleanly and the libuv `async.c` assertion in issue #34 no longer fires on Windows pwsh. Keep stderr messages unchanged.
- [X] T004 [P] Add `isThreadResolved(status: AzdoThreadStatus): boolean` helper in `src/services/pr-client.ts` — returns true for `"fixed" | "wontFix" | "closed" | "byDesign"`. Export it for use by both US1's `--hide-resolved` filter and US3's idempotent resolve/reopen short-circuit.

**Checkpoint**: shared type + exit-handling + status helper ready; user story work can now begin in parallel.

---

## Phase 3: User Story 1 — List comment threads on the current branch's PR without crashing (Priority: P1) 🎯 MVP

**Goal**: `azdo pr comments` on any branch with an open PR lists every thread (with a bracketed `[active]` / `[resolved]` / `[pending]` / ... status prefix), exits 0, no crash, no libuv assertion. `--hide-resolved` optionally drops settled threads. Covered by a real integration test against PR #64 in the test organisation.

**Independent Test**: on a branch whose PR has ≥1 comment thread, run `azdo pr comments` → output includes every thread with a status tag; rerun with `--hide-resolved` → resolved threads disappear; both runs exit 0 without stack trace.

### Tests for User Story 1 (write FIRST, let them fail before implementation)

- [X] T005 [US1] Add unit tests in `tests/unit/pr-client.test.ts` (create file if absent): (a) `mapPullRequest` tolerates `_links` missing entirely and `_links.web` missing — returns `url: null` without throwing; (b) `mapThread` returns every thread status verbatim (assert for each of `active`, `pending`, `fixed`, `wontFix`, `closed`, `byDesign`) and no longer drops non-active threads; (c) `isThreadResolved` returns true for settled statuses and false for `active`/`pending`.

### Implementation for User Story 1

- [X] T006 [US1] Widen `AzdoThreadStatus` to the full backend enum (`"unknown" | "active" | "fixed" | "wontFix" | "closed" | "byDesign" | "pending"`) and update `ActiveCommentThread.status` accordingly in `src/services/pr-client.ts` (or the co-located types file). Update any downstream type that re-exports or consumes this union.
- [X] T007 [US1] Remove the `thread.status !== 'active' && thread.status !== 'pending'` early-return in `mapThread` (`src/services/pr-client.ts:112-115`) — let every thread flow through. Keep the empty-thread suppression (drop threads whose non-deleted comments list is empty).
- [X] T008 [US1] Update the thread formatter in `src/commands/pr.ts` (`formatThreads` near lines 90-101) to prefix each thread title with a bracketed status indicator derived from the thread's backend status (`[active]`, `[pending]`, `[resolved]` for settled states; the specific backend state appears in verbose mode only if we add one later — not in scope now). Keep author + content lines unchanged.
- [X] T009 [US1] Add the `--hide-resolved` boolean flag to the `pr comments` command in `src/commands/pr.ts` (`createPrCommentsCommand`). Before rendering, filter threads with `isThreadResolved(thread.status) === true` out of the list. Default (flag absent) keeps every thread visible.
- [X] T010 [US1] Integration test: in `tests/integration/pull-requests.test.ts`, add a `describe.skipIf(SKIP_PR || !AZDO_PR_ID)` block that (a) calls `getPullRequestThreads(makeContext(), AZDO_REPO, AZDO_PAT, AZDO_PR_ID!)` against the reference PR (AZDO_PR_ID=64 per the feature spec) and asserts ≥1 thread with ≥1 non-deleted comment; (b) runs the CLI entry point (via `execa` or the existing command-test harness) with `--pr-number ${AZDO_PR_ID}` and asserts exit code 0 plus non-empty stdout. Documentation pointer: set `AZDO_PR_ID=64` locally.

**Checkpoint**: US1 deliverable — `azdo pr comments` is fixed, shows status indicators, hides resolved threads on demand, and is covered by a real integration test.

---

## Phase 4: User Story 2 — Target any pull request by number with `--pr-number <N>` (Priority: P2)

**Goal**: `azdo pr comments --pr-number <N>` works from any branch, including branches with no PR; valid but non-existent PR numbers print "PR not found" and exit non-zero; invalid formats print a validation error and exit non-zero. Neither path crashes.

**Independent Test**: checkout a branch with no PR and run `azdo pr comments --pr-number 64` — lists threads, exits 0. Run `--pr-number 9999999` → "PR not found", exit non-zero. Run `--pr-number abc` → validation error, exit non-zero.

### Tests for User Story 2

- [X] T011 [US2] Add unit tests in `tests/unit/pr-client.test.ts`: `getPullRequestById` returns a mapped `BranchPullRequestMatch` on a 200 response; maps a 404 response to `NOT_FOUND` / "PR not found" in the error flow; maps 401/403/5xx consistently with the existing helpers.
- [X] T012 [US2] Add unit tests in `tests/unit/pr-commands.test.ts` (create if absent) covering `--pr-number` validation: `--pr-number abc`, `--pr-number -3`, `--pr-number 0`, `--pr-number 3.14`, `--pr-number " 42"` (leading space / sign / float) all fail validation with a clear stderr message and non-zero exit, no crash.

### Implementation for User Story 2

- [X] T013 [US2] Implement `getPullRequestById(context: AzdoContext, repo: string, pat: string, prId: number): Promise<BranchPullRequestMatch>` in `src/services/pr-client.ts`, reusing `fetchWithErrors` / `readJsonResponse` / `mapPullRequest`. URL: `https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{prId}?api-version=7.1`. Export from the module.
- [X] T014 [US2] Add the `--pr-number <N>` option to `createPrCommentsCommand` in `src/commands/pr.ts`. Add a shared `parsePositivePrNumber(raw: string): number` validator (export from a common CLI helper or inline for now). When the flag is present: skip `getCurrentBranch` + `listPullRequests` and call `getPullRequestById`; on 404 surface "Pull request #<N> not found in <org>/<project>/<repo>." and exit non-zero; on invalid input surface commander-style validation error and exit non-zero. When absent: existing branch-lookup path is unchanged.

**Checkpoint**: US2 deliverable — the read command works end-to-end with an explicit `--pr-number`, validation is clean, the legacy branch path is untouched.

---

## Phase 5: User Story 3 — Resolve and reopen a comment thread (Priority: P3)

**Goal**: New `pr comment-resolve <threadId>` and `pr comment-reopen <threadId>` subcommands (both support `--pr-number`, `--json`) change a thread's state on the backend via `PATCH`, skip the PATCH when already in the target state, and always exit 0 on success (including the idempotent no-op, per the clarified FR-011 semantics). Not-found thread id exits non-zero with a clear message.

**Independent Test**: pick an active thread id from `azdo pr comments --pr-number 64 --json`. Run `azdo pr comment-resolve <id> --pr-number 64` → prints "resolved", exit 0; next `azdo pr comments --pr-number 64` shows the thread as resolved. Run `azdo pr comment-resolve <id> --pr-number 64` again → prints "already resolved", exit 0, `noop:true` in `--json` output. Run `azdo pr comment-reopen <id> --pr-number 64` → back to active.

### Tests for User Story 3

- [X] T015 [P] [US3] Unit test for `patchThreadStatus` in `tests/unit/pr-client.test.ts`: issues PATCH with the right URL + body, returns the mapped updated thread; maps 401/403/404/409 (409 = locked thread) consistently.
- [X] T016 [US3] Unit tests in `tests/unit/pr-commands.test.ts` for the two new commands: (a) resolve on an active thread → exit 0, "resolved", `noop:false` in JSON; (b) resolve on an already-settled thread → exit 0, "already resolved", `noop:true`, no backend PATCH call (assert via mock); (c) reopen on a settled thread → exit 0, "reopened", `noop:false`; (d) reopen on an already-active thread → exit 0, "already active", `noop:true`, no PATCH; (e) invalid `<threadId>` (non-integer / non-positive) → validation error, exit non-zero.
- [X] T017 [US3] Integration test in `tests/integration/pull-requests.test.ts`, gated on `SKIP_PR || !AZDO_PR_ID`: picks the first active thread from `AZDO_PR_ID`, resolves it via the new helper, asserts the next `getPullRequestThreads` call reports status in the settled set, reopens it, asserts the next call reports status `active`. Self-healing — always returns the PR to its starting state, even on failure (wrap in a `try/finally` that best-effort reopens).

### Implementation for User Story 3

- [X] T018 [US3] Implement `patchThreadStatus(context: AzdoContext, repo: string, pat: string, prId: number, threadId: number, status: "active" | "fixed"): Promise<ActiveCommentThread>` in `src/services/pr-client.ts`. Request: `PATCH /pullRequests/{prId}/threads/{threadId}?api-version=7.1`, `Content-Type: application/json`, body `{"status": "<status>"}`. Reuse `fetchWithErrors`. Map the 200 response through `mapThread` (widened in T007).
- [X] T019 [US3] Implement `createPrCommentResolveCommand(): Command` in `src/commands/pr.ts`: positional `<threadId>` (positive integer), shared options (`--org`, `--project`, `--pr-number`, `--json`). Flow: resolve context (branch PR or `--pr-number` via `getPullRequestById`); fetch threads; look up the thread by id (error cleanly if missing); if `isThreadResolved(current.status)` → print "Thread #<id> is already resolved on pull request #<pr>." and exit 0 with `noop:true` in `--json`; else call `patchThreadStatus(..., "fixed")`, print the success confirmation, exit 0.
- [X] T020 [US3] Implement `createPrCommentReopenCommand(): Command` in `src/commands/pr.ts`, mirroring T019 but targeting `"active"` and the inverse idempotency condition (current status ∈ settled set → PATCH; current status ∈ active/pending → no-op).
- [X] T021 [US3] Register both new subcommands under the existing `pr` parent in `createPrCommand()` (`src/commands/pr.ts`, around line 290), and ensure any top-level wiring in `src/index.ts` still compiles.

**Checkpoint**: All three user stories are independently functional and tested.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finish the feature cleanly. Constitution §Development Workflow requires the README update before merge.

- [X] T022 Update `README.md` to document: the `--pr-number <N>` and `--hide-resolved` flags on `pr comments`, and the two new subcommands `pr comment-resolve <threadId>` and `pr comment-reopen <threadId>` (with one example each, and a note about the idempotent no-op exit-0 semantics). Cross-link to `specs/017-pr-comments-threads/quickstart.md` for deeper walkthroughs.
- [X] T023 [P] Final verification sweep: run `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`. All four must be clean — zero warnings, zero errors (constitution §Development Workflow and §IV require this before the PR is marked ready).
- [ ] T024 [P] Walk through `specs/017-pr-comments-threads/quickstart.md` locally against a real PR (ideally PR #64 in the test org) to confirm the documented commands behave as written — read, resolve, reopen, hide-resolved, and both happy/error paths of `--pr-number`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup. **Blocks all user stories.**
- **User Story 1 (Phase 3)**: depends on Foundational. Independent of US2 and US3.
- **User Story 2 (Phase 4)**: depends on Foundational. Independent of US1 and US3 (does not depend on US1's mapThread widening since its own tests focus on PR resolution, not thread rendering).
- **User Story 3 (Phase 5)**: depends on Foundational **and** on US2's `getPullRequestById` (reuses the `--pr-number` path). US3 also benefits from US1's widened thread statuses (so the idempotency check sees the real backend state) — completing US1 before US3 is recommended, though not strictly required by the tests.
- **Polish (Phase 6)**: depends on at least the user stories the release is shipping (all three for this feature).

### Within Each User Story

- Tests (T005, T011–T012, T015–T017) are written FIRST and expected to FAIL before implementation lands, per TDD discipline.
- Service helpers (`getPullRequestById`, `patchThreadStatus`) land before the command wiring that consumes them.
- Command wiring before register-in-parent.
- Commit incrementally — one or two tasks per commit, with `feat(#34): T005–T007 widen thread statuses` style messages (matches speckit-gh convention).

### Parallel Opportunities

- **Phase 2**: T003 (error-exit refactor in `pr.ts`) and T004 (isThreadResolved helper in `pr-client.ts`) are `[P]`; T002 touches both type definitions and `mapPullRequest` (partially overlapping with T004's file) so serialise it against T004.
- **Phase 3**: T005 (unit tests) before T006–T009 (impl in same source files, mostly serial); T010 (integration test file) is `[P]` against the unit test file.
- **Phase 4**: T011 and T012 `[P]` (different test files); T013 before T014 (T014 depends on T013's helper).
- **Phase 5**: T015 `[P]` with T016 (different test files); T016 before T019/T020 (impl consumes the helpers); T021 after T019/T020.
- **Phase 6**: T023 and T024 `[P]` (different workflows — one is a CI-style verification sweep, the other is a manual walkthrough).

---

## Parallel Example: User Story 1

```bash
# Launch the unit + integration test files together before any impl lands:
Task: "T005 add unit tests for mapPullRequest, mapThread, isThreadResolved in tests/unit/pr-client.test.ts"
Task: "T010 add integration test for pr comments against AZDO_PR_ID in tests/integration/pull-requests.test.ts"

# Within impl, T008 (formatter) and T009 (--hide-resolved flag) both touch src/commands/pr.ts — serialise them.
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 baseline.
2. Phase 2 foundational.
3. Phase 3 US1 complete — the crash is fixed, status indicators appear, hide-resolved works, integration test covers PR #64.
4. **Stop and validate**: `azdo pr comments` runs cleanly on Windows pwsh, macOS, Linux. This alone closes the original bug report.
5. Ship MVP if ready (owner directs merge).

### Incremental delivery

6. Phase 4 US2 — `--pr-number` lands, unblocks any-PR read access.
7. Phase 5 US3 — resolve / reopen land, complete the stretch feature.
8. Phase 6 polish — README + final sweep.

### Out of scope reminders

- No version bump in `package.json`.
- No release, tag, or `gh release create` anywhere in this flow — gitflow release is separate (spec "Out of scope").
- No new runtime dependencies (constitution §IV).
- No `@copilot` or other bot mentions in commits or PR comments.

---

## Notes

- `[P]` tasks = different files, no dependencies — truly parallelisable.
- `[Story]` label maps task to its user story (US1 / US2 / US3) for traceability back to spec.md.
- Each user story is independently testable once Phase 2 completes.
- Verify every test fails before implementing.
- Commit after each task or logical group; squash is owner-directed at merge time, not ours.
- Stop at any checkpoint to re-sync with the owner on the issue / PR.
