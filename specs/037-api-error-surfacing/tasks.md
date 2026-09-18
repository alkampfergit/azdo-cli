# Tasks: 037-api-error-surfacing

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [contracts/error-surfacing.md](./contracts/error-surfacing.md)
**Gate**: `npm test && npm run lint` must pass before the PR is marked ready.

`[P]` = can run in parallel with the other `[P]` tasks in the same phase.

## Phase 1 — HTTP layer capture (User Story 1, P1)

- [X] **T001** `src/services/azdo-client.ts`: add `MAX_DETAIL_CHARS` / `MAX_RAW_BODY_CHARS` and `describeFailureBody(body, contentType)` implementing contract C-2 (redact → parse → `message` / `typeKey` / `errorCode` → raw 200-char fallback → 500-char truncation; `null` for empty or HTML bodies).
- [X] **T002** `src/services/azdo-client.ts`: add `failureDetails: WeakMap<Response, string>`; in `fetchWithErrors`, read the body of every non-ok response once (reusing the trace text when a writer is active) and store the rendered detail. The returned response must keep an unconsumed stream.
- [X] **T003** `src/services/azdo-client.ts`: append the detail to the 401 (`AUTH_FAILED`) and 403 (`PERMISSION_DENIED`) throws. 404 and the `text/html` guard unchanged.
- [X] **T004** `src/services/azdo-client.ts`: export `httpError(response): Error` returning `HTTP_<status>[: detail]`, falling back to the bare sentinel for responses not seen by `fetchWithErrors`.

## Phase 2 — throw-site migration (depends on Phase 1)

- [X] **T005** `src/services/azdo-client.ts`: replace the 9 `HTTP_${response.status}` throws with `httpError(response)`, leaving the six curated `status === 400` branches ahead of them intact.
- [X] **T006 [P]** `src/services/pr-client.ts`: same replacement at the 4 sites.
- [X] **T007 [P]** `src/services/relations-client.ts`: same replacement at the 3 sites.
- [X] **T008 [P]** `src/services/pipeline-client.ts`: same replacement at the 2 sites.

## Phase 3 — sentinel prefix matching + detail output (contract C-1, C-4)

- [X] **T009** `src/services/command-helpers.ts`: export `sentinelDetail(message, sentinel)`; switch the two `===` comparisons to prefix matches and print the detail on an indented follow-up line.
- [X] **T010 [P]** `src/commands/pr.ts`: prefix-match `AUTH_FAILED` / `PERMISSION_DENIED` (exit code 4 preserved), print the detail beneath the curated line.
- [X] **T011 [P]** `src/commands/pipeline.ts`: same.
- [X] **T012 [P]** `src/commands/relations.ts`: same.
- [X] **T013 [P]** `src/commands/upsert.ts`: prefix-match in `isUpdateWriteError` / `isCreateWriteError` and in `handleUpsertError`.
- [X] **T014** `src/services/pr-client.ts`: prefix-match the `AUTH_FAILED` → `IDENTITY_SCOPE_MISSING` mapping in `resolveIdentity`.

## Phase 4 — description pre-flight (User Story 2, P1)

- [X] **T015** `src/types/pull-request.ts`: add the `ComposedDescription` interface from [data-model.md](./data-model.md).
- [X] **T016** `src/services/pr-client.ts`: add `MAX_PR_DESCRIPTION_CHARS = 4000` with the verified Learn URL in a comment; make `composeDescription` return `ComposedDescription | null`.
- [X] **T017** `src/services/pr-client.ts`: add `formatDescriptionOverflow(composed)` and reject with `DESCRIPTION_TOO_LONG: …` in `openPullRequest` before the payload is built (contract C-5).
- [X] **T018** `src/services/pr-client.ts`: wrap the create POST so an `HTTP_400` failure is rethrown with the arithmetic appended (contract C-6).
- [X] **T019** `src/commands/pr.ts`: render `DESCRIPTION_TOO_LONG` as a validation error (exit code 1) without the `Azure DevOps request failed` wrapper.

## Phase 5 — tests

- [X] **T020** `tests/unit/api-error-surfacing.test.ts` (new): contract C-2 table, the 401/403 detail, the HTML no-echo guard, truncation, redaction, `httpError` fallback, and `BAD_REQUEST:` still winning on 400.
- [X] **T021** `tests/unit/pr-client.test.ts`: description pre-flight under / exactly at / over the limit, with and without a template; assert no create request is issued on rejection; assert the 400 backstop message.
- [X] **T022** `tests/unit/pr-exit-codes.test.ts` / `tests/unit/helpers/command-test-utils.ts`: prove a detail-carrying `AUTH_FAILED: …` still exits 4 with the curated first line.

## Phase 6 — docs & wrap-up

- [X] **T023** `docs/commands.md`: `pr open` template contribution, the 4000-character write cap, and the new enriched error output. (The 400-character read-side truncation named in an earlier draft is omitted: `research.md` could not confirm it against Learn.)
- [X] **T024** `CLAUDE.md` / `AGENTS.md` recent-changes entries.
- [X] **T025** `specs/037-api-error-surfacing/pr-report.md` from the template.
- [X] **T026** Run `npm test && npm run lint`; open the PR with `Closes #95`.

## Dependencies

Phase 1 → Phase 2 → Phase 3 (T009 before T010–T013 for the shared helper).
Phase 4 is independent of Phases 1–3 and can proceed in parallel, except T018,
which needs `httpError` from T004. Phase 5 needs Phases 1–4. Phase 6 last.
