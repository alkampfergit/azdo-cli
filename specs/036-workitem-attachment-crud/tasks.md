---

description: "Task list for workitem-attachment-crud"

---

# Tasks: Work Item Attachment Create/Delete

**Input**: Design documents from `/specs/036-workitem-attachment-crud/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli-commands.md, quickstart.md

**Tests**: Included — plan.md's Project Structure explicitly calls for
`tests/unit/add-attachment.test.ts`, `tests/unit/delete-attachment.test.ts`, and
`tests/integration/work-item-attachments.test.ts` (SKIP_AZDO-gated), matching this repo's
existing test-first convention (see `035-fix-workitem-artifact-uri`).

**Organization**: Tasks are grouped by the three user stories in spec.md — US1 (P1, attach),
US2 (P2, delete), US3 (P3, discoverability).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths are included in every task description

## Path Conventions

Single project (existing repo layout): `src/`, `tests/` at repository root.

---

## Phase 1: Setup

**Purpose**: Establish a clean baseline before any change.

- [X] T001 Confirm the working tree is on branch `036-workitem-attachment-crud`
  (`git status --porcelain` empty) and run `npm run build` to establish a clean baseline
  before touching `src/services/azdo-client.ts`, `src/types/work-item.ts`, or
  `src/services/image-download.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared `WorkItemAttachment.id` field and GUID-extraction helper that both User
Story 1 (attach reports the ID) and User Story 2 (delete matches/lists by ID) depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] In `src/types/work-item.ts`, add `id: string` to the `WorkItemAttachment`
  interface (before `name`, per data-model.md): `{ id: string; name: string; size: number;
  url: string; }`.
- [X] T003 [P] In `src/services/image-download.ts`, extract and **export** a new
  `extractAttachmentGuid(url: string): string | null` helper that runs the existing
  `ATTACHMENT_GUID_RE` pattern against a URL's pathname and returns the lower-cased GUID (or
  `null` if no match); refactor `parseAttachmentReference` (around line 80) to call it
  internally instead of using `ATTACHMENT_GUID_RE` inline, so there is exactly one GUID
  regex in the codebase (research.md's "reuse `ATTACHMENT_GUID_RE`" decision).
- [X] T004 In `src/services/azdo-client.ts`, update `extractAttachments()` (line 311) to
  populate `id: extractAttachmentGuid(r.url) ?? ''` on each mapped attachment, importing
  `extractAttachmentGuid` from `./image-download.js` (depends on T002, T003).
- [X] T005 [P] Update the `WorkItemAttachment` literals in
  `tests/unit/get-item-attachments.test.ts` (lines ~45, ~59-61) to include an `id` field on
  each fixture so the file still type-checks against the new interface (depends on T002).
- [X] T006 Update `tests/unit/download-attachment.test.ts`'s
  `returns attachments from AttachedFile relations` test (lines ~30-49): change the fixture
  relation URLs from placeholder text (`.../attachments/guid1`, `.../attachments/guid2`) to
  real GUID-shaped URLs, and add the corresponding lower-cased `id` field to each object in
  the `expect(item.attachments).toEqual([...])` assertion (depends on T004).
- [X] T007 Run `npx vitest run tests/unit/get-item-attachments.test.ts
  tests/unit/download-attachment.test.ts` and `npm run typecheck`; confirm both pass with no
  type errors (depends on T002-T006).

**Checkpoint**: `WorkItemAttachment.id` is populated everywhere attachments are read — user
story implementation can now begin.

---

## Phase 3: User Story 1 - Attach a file to a work item (Priority: P1) 🎯 MVP

**Goal**: `azdo add-attachment <id> <file> [--comment <text>]` uploads a local file, links it
to the work item as a new `AttachedFile` relation (never replacing an existing same-name
attachment), and reports the attached file's name, size, and stable ID.

**Independent Test**: Run the command against a real work item with a local file path and
confirm the reported name/size/ID, then confirm the attachment appears via `get-item` /
`download-attachment`.

### Tests for User Story 1 ⚠️

> Write these tests FIRST, confirm they FAIL (command doesn't exist yet).

- [X] T008 [P] [US1] Create `tests/unit/add-attachment.test.ts` covering (per
  contracts/cli-commands.md and spec.md Acceptance Scenarios 1-5): a successful attach prints
  `Attached "<filename>" (<size>) to work item <id> [id: <attachment-guid>]` to stdout and
  calls the upload + PATCH sequence with a `rel: "AttachedFile"` relation; a missing local
  file path exits 1 with a clear error and makes **no** network call; an unknown/inaccessible
  work item surfaces the work-item error via `handleCommandError`; `--comment <text>` is
  passed through as `attributes.comment` on the relation and omitted entirely when not given;
  `--org`/`--project` pairing is validated via the existing `validateOrgProjectPair`.

### Implementation for User Story 1

- [X] T009 [US1] In `src/services/azdo-client.ts`, add and export
  `createAttachment(context: AzdoContext, fileName: string, content: Buffer, cred:
  AuthCredential): Promise<{ id: string; url: string }>` — `POST
  https://dev.azure.com/{org}/{project}/_apis/wit/attachments?fileName={name}&api-version=7.1`
  with `Content-Type: application/octet-stream`, body = raw bytes, using the existing
  `fetchWithErrors`/`authHeaders` pattern; map non-OK responses through the same
  `BAD_REQUEST` / `HTTP_<status>` error shapes used by `fetchWorkItemResponse` (research.md's
  upload-mechanism decision).
- [X] T010 [US1] Create `src/commands/add-attachment.ts` exporting
  `createAddAttachmentCommand()`, following `download-attachment.ts`'s structure:
  `azdo add-attachment <id> <file> [--comment <text>] [--org <org>] [--project <project>]`.
  Validate the local file exists and is a regular file (`existsSync` + `statSync().isFile()`)
  **before** any network call, exiting 1 with a clear error otherwise (FR-003). On success,
  call `createAttachment()` (T009) then `applyWorkItemPatch(context, id, cred, [{ op: 'add',
  path: '/relations/-', value: { rel: 'AttachedFile', url: <attachment url>, attributes:
  comment ? { comment } : undefined } }])`, and print
  `` `Attached "${filename}" (${formatFileSize(size)}) to work item ${id} [id: ${attachmentId}]\n` ``
  (reuse `formatFileSize` from `./get-item.js`). Route errors through the existing
  `handleCommandError` (depends on T009).
- [X] T011 [US1] Register the new command in `src/index.ts`: import
  `createAddAttachmentCommand` from `./commands/add-attachment.js` and add
  `program.addCommand(createAddAttachmentCommand());` alongside the other command
  registrations (depends on T010).
- [X] T012 [US1] Run `npx vitest run tests/unit/add-attachment.test.ts` and confirm every
  test from T008 now PASSES (depends on T008, T009, T010, T011).

**Checkpoint**: `azdo add-attachment` is fully functional and independently testable.

---

## Phase 4: User Story 2 - Remove an attachment from a work item (Priority: P2)

**Goal**: `azdo delete-attachment <id> <filename> [--id <guid>] [--yes]` removes exactly one
`AttachedFile` relation, confirming interactively unless `--yes` is given, and refuses to
guess (even under `--yes`) when the filename is ambiguous unless `--id` is also supplied.

**Independent Test**: Attach a known file, run the delete command referencing its filename,
and confirm it no longer appears among the work item's attachments.

### Tests for User Story 2 ⚠️

> Write these tests FIRST, confirm they FAIL (command doesn't exist yet).

- [ ] T013 [P] [US2] Create `tests/unit/delete-attachment.test.ts` covering (per
  contracts/cli-commands.md and spec.md Acceptance Scenarios 1-6 / Edge Cases): confirm+delete
  happy path prints `Removed "<filename>" (id: <attachment-guid>) from work item <id>`; a
  filename with no match exits 1 with `Error: Attachment "<filename>" not found on work item
  <id>.`; an unknown/inaccessible work item surfaces via `handleCommandError`; `--yes`/`-y`
  skips the interactive prompt; a filename shared by 2+ attachments with **no** `--id` prints
  the `multiple attachments named ...` candidate listing (ID, size, upload date) and exits 1
  **even when `--yes` is also given**; a shared filename **with** `--id <guid>` removes only
  the matching relation and leaves the others untouched; declining confirmation (or running
  non-interactively without `--yes`) makes no change and reports that confirmation is
  required.

### Implementation for User Story 2

- [ ] T014 [P] [US2] In `src/services/command-helpers.ts`, add and export
  `promptYesNo(prompt: string): Promise<boolean>`, moved verbatim from
  `src/commands/auth.ts` (line 50) — auto-confirms when `stdin` is not a TTY, otherwise reads
  a `[y/N]` answer. Update `src/commands/auth.ts` to import `promptYesNo` from
  `./services/command-helpers.js` and delete its local copy; `confirmOverwrite` /
  `confirmOverwriteCredential` keep calling it unchanged (research.md's confirmation-prompt
  decision).
- [ ] T015 [US2] In `src/services/azdo-client.ts`, add and export
  `findAttachmentRelations(context: AzdoContext, id: number, cred: AuthCredential, filename:
  string): Promise<Array<{ index: number; id: string; name: string; size: number;
  uploadedDate?: string }>>` — fetches the work item with `$expand=relations` (same
  `fetchWorkItemResponse(..., { includeRelations: true })` call `getWorkItem` already makes),
  filters relations to `rel === 'AttachedFile' && attributes.name === filename`, and maps each
  match to its **array index** in the raw `relations` list (not `extractAttachments()`'s
  output, which drops index — data-model.md), its GUID via `extractAttachmentGuid` (T003),
  its size, and its upload date. **Before implementing**: if research.md does not already name
  the exact relation `attributes` field for upload date, consult
  `microsoft_docs_search`/`microsoft_docs_fetch` for the Work Item `AttachedFile` relation
  schema (e.g. `resourceCreatedDate`) per constitution principle VI, and append a one-line
  finding to research.md (depends on T003).
- [ ] T016 [US2] Create `src/commands/delete-attachment.ts` exporting
  `createDeleteAttachmentCommand()`: `azdo delete-attachment <id> <filename> [--id
  <attachment-guid>] [--yes|-y] [--org <org>] [--project <project>]`. Call
  `findAttachmentRelations()` (T015); if zero matches, print the not-found error and exit 1;
  if more than one match and no `--id`, print the ambiguous-candidate listing (ID, size,
  upload date) and exit 1 **before** checking `--yes` (FR-014, FR-016); if more than one match
  and `--id` is given, narrow to the matching GUID (or report not-found if none match); with
  exactly one resolved match, confirm via `promptYesNo` (T014) unless `--yes`, then call
  `applyWorkItemPatch(context, id, cred, [{ op: 'remove', path: `/relations/${index}` }])` and
  print `` `Removed "${filename}" (id: ${attachmentId}) from work item ${id}\n` ``. Route
  errors through `handleCommandError` (depends on T014, T015).
- [ ] T017 [US2] Register the new command in `src/index.ts`: import
  `createDeleteAttachmentCommand` from `./commands/delete-attachment.js` and add
  `program.addCommand(createDeleteAttachmentCommand());` (depends on T016).
- [ ] T018 [US2] Run `npx vitest run tests/unit/delete-attachment.test.ts` and confirm every
  test from T013 now PASSES (depends on T013-T017).

**Checkpoint**: `azdo add-attachment` and `azdo delete-attachment` both work independently.

---

## Phase 5: User Story 3 - Discover the new commands (Priority: P3)

**Goal**: Both new commands appear in `azdo --help` and each has clear, self-sufficient
`--help` output — directly addressing the source issue's "not well documented" complaint.

**Independent Test**: Run `azdo --help` and each new command's own `--help`, confirm both are
listed with a clear one-line description and complete usage.

### Tests for User Story 3

- [ ] T019 [P] [US3] Extend `tests/unit/cli.test.ts`'s `--help outputs usage information`
  coverage (or add a new `it` block) to assert the top-level `--help` output lists both
  `add-attachment` and `delete-attachment` alongside `download-attachment`, and that
  `azdo add-attachment --help` / `azdo delete-attachment --help` each describe their
  arguments and options (FR-008, SC-003) (depends on T011, T017).

### Implementation for User Story 3

- [ ] T020 [US3] If T019 reveals a gap (missing/unclear `.description()` text on either
  command or its options in `add-attachment.ts` / `delete-attachment.ts`), tighten the
  wording; otherwise confirm no source change is needed — commander.js derives `--help` from
  the `.description()`/`.argument()`/`.option()` calls already written in T010/T016 (depends
  on T019).

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T021 [P] Run `npm run typecheck && npm run lint && npm run build`; fix any fallout from
  the `WorkItemAttachment.id` type change or the `promptYesNo` move.
- [ ] T022 [P] Create `tests/integration/work-item-attachments.test.ts`
  (`describe.skipIf(SKIP_AZDO)`, following `tests/integration/get-item-attachments.test.ts`'s
  structure): attach a file to the fixture work item, verify it via `getWorkItem`, delete it,
  verify it's gone, and cover the ambiguous-filename + `--id` path by attaching two files
  under the same name and deleting one by ID.
- [ ] T023 Walk through `specs/036-workitem-attachment-crud/quickstart.md` end-to-end against
  a real Azure DevOps org/project; note in the PR report which steps are covered by T022's
  automated integration test versus manual owner verification.
- [ ] T024 Run `npm test` (typecheck + lint + build + full unit/integration suite) and confirm
  no regressions.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. Blocks all three user stories (both attach and
  delete surface/consume the new `id` field).
- **User Story 1 (Phase 3)**: Depends on Foundational only. This is the MVP.
- **User Story 2 (Phase 4)**: Depends on Foundational only — independent of User Story 1's
  command file, though it reuses the same `handleCommandError`/`applyWorkItemPatch` plumbing.
- **User Story 3 (Phase 5)**: Depends on User Story 1 (T011) and User Story 2 (T017) having
  registered their commands, since it verifies both show up in `--help`.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each User Story

- Tests (T008, T013, T019) are written/updated and confirmed to fail before their
  implementation tasks.
- Service-layer functions (T009, T015) before the command files that call them (T010, T016).
- Command file before `index.ts` registration (T010→T011, T016→T017).
- Registration before the story's "confirm tests pass" task (T012, T018).

### Parallel Opportunities

- T002 and T003 (different files: `types/work-item.ts` vs `services/image-download.ts`).
- T005 (different file, only depends on T002) can run alongside T004's implementation, though
  T006 depends on T004's actual output.
- T008 (US1 tests) and T013 (US2 tests) can be drafted in parallel — different files, no
  shared state — and, once Foundational is done, User Story 1 and User Story 2 implementation
  can proceed in parallel by different contributors.
- T014 (US2, `command-helpers.ts`/`auth.ts`) and T015 (US2, `azdo-client.ts`) touch different
  files and can run in parallel.
- T021 and T022 (Polish) touch different files and can run in parallel.

---

## Parallel Example: Foundational + User Story 1 / User Story 2 kickoff

```bash
# Foundational: T002 and T003 touch different files
# (src/types/work-item.ts vs src/services/image-download.ts)

# Once Foundational (T002-T007) is done, draft both story test files together:
# T008 -> tests/unit/add-attachment.test.ts
# T013 -> tests/unit/delete-attachment.test.ts
npx vitest run tests/unit/add-attachment.test.ts tests/unit/delete-attachment.test.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001).
2. Complete Phase 2: Foundational (T002-T007) — CRITICAL, blocks all stories.
3. Complete Phase 3: User Story 1 (T008-T012).
4. **STOP and VALIDATE**: confirm `azdo add-attachment` works against a real work item.

### Incremental Delivery

1. Setup + Foundational → shared `id` field ready.
2. Add User Story 1 (T008-T012) → test independently → MVP.
3. Add User Story 2 (T013-T018) → test independently.
4. Add User Story 3 (T019-T020) → confirm discoverability.
5. Polish (T021-T024) → full validation suite, integration tests, quickstart walkthrough →
   ready for PR.

### Parallel Team Strategy

1. Team completes Setup + Foundational together (T001-T007).
2. Once Foundational is done: Developer A takes User Story 1 (T008-T012), Developer B takes
   User Story 2 (T013-T018) — they touch disjoint files (`add-attachment.ts` vs
   `delete-attachment.ts`) except for the shared `index.ts` registration lines, which are
   small and low-conflict.
3. User Story 3 (T019-T020) starts once both command files are registered.

---

## Notes

- [P] tasks touch different files or non-overlapping regions of the same file.
- No new runtime dependencies are introduced anywhere in this task list (constitution
  Simplicity principle) — everything reuses `fetchWithErrors`, `authHeaders`/`writeHeaders`,
  `applyWorkItemPatch`, `handleCommandError`, `parseWorkItemId`, `validateOrgProjectPair`, and
  `formatFileSize`.
- Commit after each phase checkpoint (Foundational; US1; US2; US3; Polish).
- T015's Microsoft Learn MCP lookup is the only outstanding API-surface unknown not already
  closed out in research.md — resolve it before writing `findAttachmentRelations`, not after.
