# Tasks: PR Comment Reply

**Input**: Design documents from `/specs/029-pr-comment-reply/`  
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no shared-state dependencies)
- **[Story]**: User story this task belongs to (US1/US2/US3)

---

## Phase 1: Setup

**Purpose**: No new project or dependency setup is needed (existing TypeScript/commander.js project, no new runtime deps). Single verification task.

- [x] T001 Confirm branch `029-pr-comment-reply` is checked out and up to date with `origin/029-pr-comment-reply`; run `npm install` to ensure lockfile is consistent

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: New types and service function that ALL user story phases depend on. Must complete before any command code is written.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 Add `AzdoCreatedComment` and `PostedPrComment` interfaces to `src/types/pull-request.ts` (per `data-model.md` — shapes for the POST /comments API response and the CLI's mapped result type)
- [x] T003 [P] Add `buildThreadCommentUrl()` (internal) and `postThreadComment()` (exported) to `src/services/pr-client.ts` — POST to `/pullRequests/{prId}/threads/{threadId}/comments?api-version=7.1` with `{ content, parentCommentId: 0, commentType: 1 }`, map response to `PostedPrComment`
- [x] T004 [P] Add `postThreadComment()` unit tests in `tests/unit/pr-client.test.ts` — mock `fetch` to cover: success 200, auth failure 401, permission denied 403, thread not found 404, network error

**Checkpoint**: `postThreadComment()` is tested and the types are in place — user story implementation can begin.

---

## Phase 3: User Story 1 — Reply to a PR thread (Priority: P1) 🎯 MVP

**Goal**: `azdo pr comments reply <threadId> "<text>"` posts a reply and prints human-readable confirmation.

**Independent Test**: Run `azdo pr comments reply <threadId> "hello"` on a PR with a known thread; re-run `azdo pr comments` and confirm the reply appears in the thread listing.

### Implementation for User Story 1

- [x] T005 [US1] Add `runCommentReply()` action function in `src/commands/pr.ts` — reuse `resolveThreadTarget()` for PR resolution; validate `threadIdRaw` as positive integer and `text` as non-empty (exit 1 with `Reply text must not be empty.` on failure); fetch threads with `getPullRequestThreads()` and find the target thread (exit 1 with `Thread #<id> not found on pull request #<pr>.` if missing); call `postThreadComment()`; print `Reply posted to thread #<threadId> on pull request #<prId>.\n` to stdout
- [x] T006 [US1] Add `createPrCommentsReplyCommand()` factory in `src/commands/pr.ts` — `new Command('reply')`, argument `<threadId>`, argument `<text>`, options `--org`, `--project`, `--pr-number` (reuse `PR_NUMBER_HELP`), action delegates to `runCommentReply()`
- [x] T007 [US1] Register the reply subcommand: inside `createPrCommentsCommand()` in `src/commands/pr.ts`, add `command.addCommand(createPrCommentsReplyCommand())` before `return command`

**Checkpoint**: `azdo pr comments reply <threadId> "<text>"` works end-to-end on a real PR. Human-readable output only at this point.

---

## Phase 4: User Story 2 — JSON output for scripted use (Priority: P2)

**Goal**: `azdo pr comments reply <threadId> "<text>" --json` emits `{ pullRequestId, threadId, commentId, content }`.

**Independent Test**: Run with `--json`, parse stdout, confirm all four fields are present and types are correct.

### Implementation for User Story 2

- [x] T008 [US2] Add `PrCommentReplyResult` local interface in `src/commands/pr.ts` — `{ pullRequestId: number; threadId: number; commentId: number; content: string }`
- [x] T009 [US2] Add `--json` option to `createPrCommentsReplyCommand()` in `src/commands/pr.ts`; extend `runCommentReply()` to accept `options.json` — when true, emit `JSON.stringify(result, null, 2)` to stdout instead of the human-readable line; on `--json` + error, errors still go to stderr and stdout stays empty

**Checkpoint**: `azdo pr comments reply <threadId> "<text>" --json` emits the structured JSON object.

---

## Phase 5: User Story 3 — Alias command (Priority: P3)

**Goal**: `azdo pr comment-reply <threadId> "<text>"` works identically to `azdo pr comments reply`.

**Independent Test**: Run `azdo pr comment-reply <threadId> "alias test"` and verify same output as the canonical form.

### Implementation for User Story 3

- [x] T010 [US3] Add `createPrCommentReplyCommand()` factory in `src/commands/pr.ts` — `new Command('comment-reply')`, identical arguments/options to `createPrCommentsReplyCommand()`, same `runCommentReply()` action, description: `'Post a reply to a pull request comment thread (alias of "azdo pr comments reply")'`
- [x] T011 [US3] Register alias: inside `createPrCommand()` in `src/commands/pr.ts`, add `command.addCommand(createPrCommentReplyCommand())` alongside the existing `comment-resolve` and `comment-reopen` registrations

**Checkpoint**: Both `azdo pr comments reply` and `azdo pr comment-reply` work end-to-end.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, final build verification, and README update (required by constitution before merge).

- [x] T012 [P] Update `README.md` — add `azdo pr comments reply` and `azdo pr comment-reply` to the PR commands section with usage examples matching the contract in `contracts/cli-commands.md`
- [x] T013 Run `npm run lint && npm test && npm run build` and confirm zero errors, zero warnings; fix any lint or type issues before marking complete

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — **BLOCKS Phases 3–5**
- **Phase 3 (US1)**: Depends on Phase 2 — core command body
- **Phase 4 (US2)**: Depends on Phase 3 — adds `--json` to existing action
- **Phase 5 (US3)**: Depends on Phase 3 — alias reuses the same action
- **Phase 6 (Polish)**: Depends on Phases 3–5 complete

### Within Phase 2

- T003 and T004 can run in parallel (different files: `pr-client.ts` vs `pr-client.test.ts`)

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only
- **US2 (P2)**: Depends on US1 (extends the same function — must be sequential)
- **US3 (P3)**: Depends on US1 (reuses `runCommentReply` — types must exist)

---

## Parallel Opportunities

```bash
# Phase 2: T003 and T004 run in parallel
Task T003: "Add postThreadComment() to src/services/pr-client.ts"
Task T004: "Add unit tests for postThreadComment() in tests/unit/pr-client.test.ts"

# Phase 6: T012 runs in parallel with any remaining cleanup
Task T012: "Update README.md"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002–T004)
3. Complete Phase 3: User Story 1 (T005–T007)
4. **STOP and VALIDATE**: `azdo pr comments reply <threadId> "hello"` posts a reply
5. Continue to US2 (JSON), US3 (alias), then Polish

### Incremental Delivery

1. T001–T004 → foundation ready, service tested
2. T005–T007 → `azdo pr comments reply` works (MVP)
3. T008–T009 → `--json` works
4. T010–T011 → `azdo pr comment-reply` alias works
5. T012–T013 → docs updated, build green → ready for PR

---

## Notes

- All code in `src/commands/pr.ts` and `src/services/pr-client.ts` — no new files needed
- `runCommentReply()` is the only new async action function; US2 and US3 extend it rather than duplicate it
- `resolveThreadTarget()` is fully reused — no modification needed
- `handlePrCommandError(err, context, 'write')` handles all network/auth/server errors
- `parsePositivePrNumber()` is reused for threadId validation (already validates positive integers)
- `configureUnwrappedHelp()` must be applied to both new commands
