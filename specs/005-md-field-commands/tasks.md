# Tasks: Markdown Field Commands

**Input**: Design documents from `/specs/005-md-field-commands/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the feature specification. Test tasks are omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependency and prepare shared infrastructure

- [ ] T001 Install `node-html-markdown` as a production dependency by running `npm install node-html-markdown` — this is a zero-dependency HTML-to-markdown converter with native TypeScript types, chosen per research.md (R2) for minimal bundle impact with tsup

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extract shared infrastructure that multiple commands depend on

**CRITICAL**: Both US1 and US2 depend on this phase

- [ ] T002 Extract `resolveContext` function from `src/commands/set-field.ts` into a new shared service module `src/services/context.ts` — export `resolveContext(options: { org?: string; project?: string }): AzdoContext`. Move the logic that checks CLI flags → config → git remote fallback (lines 8-35 of set-field.ts). Update `src/commands/set-field.ts` to import `resolveContext` from `../services/context.js` instead of using its local copy. Verify existing `set-field` command still works after extraction. This satisfies Constitution Principle III: "Shared logic MUST be extracted into service modules under `src/` rather than duplicated across commands."

**Checkpoint**: Existing `set-field` command works identically after extraction. `resolveContext` is importable from `src/services/context.ts`.

---

## Phase 3: User Story 1 — Retrieve a Markdown Field (Priority: P1) 🎯 MVP

**Goal**: Users can run `azdo get-md-field <id> <field>` to retrieve any rich-text field from a work item and receive clean markdown output, with automatic HTML-to-markdown conversion when needed.

**Independent Test**: Run `azdo get-md-field <workItemId> System.Description` against a work item with HTML content and verify the output is valid markdown.

### Implementation for User Story 1

- [ ] T003 [P] [US1] Create HTML detection service in `src/services/html-detect.ts` — export a function `isHtml(content: string): boolean` that uses the regex `/<\/?(p|br|div|span|strong|em|b|i|u|a|ul|ol|li|h[1-6]|table|tr|td|th|img|pre|code)\b/i` to detect whether content contains HTML tags (per research.md R3). Return `true` if HTML tags are found, `false` otherwise.

- [ ] T004 [P] [US1] Create HTML-to-markdown conversion wrapper in `src/services/md-convert.ts` — export a function `htmlToMarkdown(html: string): string` that wraps `node-html-markdown`'s `NodeHtmlMarkdown.translate()` call. Import `isHtml` from `html-detect.ts` and also export a convenience function `toMarkdown(content: string): string` that checks `isHtml(content)` first: if HTML, convert; if not, return content unchanged (per FR-002, FR-003, FR-004).

- [ ] T005 [US1] Add `getWorkItemFieldValue` function to `src/services/azdo-client.ts` — a new exported async function that fetches a single field's raw value from the Azure DevOps REST API. Signature: `getWorkItemFieldValue(context: AzdoContext, id: number, pat: string, fieldName: string): Promise<string | null>`. Use the same URL pattern as `getWorkItem` but with `fields=` query param set to only the requested field. Return the raw string value of the field (do NOT process or combine like `getWorkItem` does). Handle same error codes (401→AUTH_FAILED, 403→PERMISSION_DENIED, 404→NOT_FOUND, network→NETWORK_ERROR).

- [ ] T006 [US1] Create `get-md-field` command in `src/commands/get-md-field.ts` — export `createGetMdFieldCommand(): Command`. Follow the contract in `contracts/cli-commands.md`. Use commander.js with: `.argument('<id>', 'work item ID')`, `.argument('<field>', 'field reference name')`, `.option('--org <org>')`, `.option('--project <project>')`. In the action: (1) validate ID is positive integer, (2) resolve context by importing `resolveContext` from `../services/context.js`, (3) authenticate via `resolvePat()`, (4) call `getWorkItemFieldValue()`, (5) if field is null/empty output empty string, (6) call `toMarkdown(value)` from md-convert, (7) write result to stdout via `process.stdout.write(result + '\n')`. Error handling follows same pattern as `set-field.ts` (AUTH_FAILED, PERMISSION_DENIED, NOT_FOUND, NETWORK_ERROR → stderr + exit 1). No `--json` flag (per clarification Q3 — raw markdown only, FR-015).

- [ ] T007 [US1] Register `get-md-field` command in `src/index.ts` — add `import { createGetMdFieldCommand } from './commands/get-md-field.js'` and `program.addCommand(createGetMdFieldCommand())` following the existing pattern.

**Checkpoint**: `azdo get-md-field <id> <field>` works end-to-end. HTML fields are automatically converted to markdown. Plain text and markdown fields pass through unchanged.

---

## Phase 4: User Story 2 — Set a Markdown Field with Inline Content (Priority: P1)

**Goal**: Users can run `azdo set-md-field <id> <field> "markdown content"` to update a work item field with markdown content, with the field type explicitly set to markdown format.

**Independent Test**: Run `azdo set-md-field <workItemId> System.Description "# Test\n\nSome **bold** text"` and verify the field renders as markdown in the Azure DevOps web UI.

### Implementation for User Story 2

- [ ] T008 [US2] Create `set-md-field` command in `src/commands/set-md-field.ts` — export `createSetMdFieldCommand(): Command`. Follow the contract in `contracts/cli-commands.md`. Use commander.js with: `.argument('<id>', 'work item ID')`, `.argument('<field>', 'field reference name')`, `.argument('[content]', 'inline markdown content')`, `.option('--org <org>')`, `.option('--project <project>')`, `.option('--json', 'output result as JSON')`. In the action: (1) validate ID is positive integer, (2) if content argument is provided, use it as the markdown source, (3) if no content → error with message: `"Error: No content provided. Provide markdown as an argument, via --file, or pipe through stdin."` (placeholder for US3/US4 — will add file and stdin later), (4) resolve context by importing `resolveContext` from `../services/context.js`, (5) authenticate via `resolvePat()`, (6) build two JSON Patch operations: `{ op: 'add', path: '/fields/<field>', value: content }` and `{ op: 'add', path: '/multilineFieldsFormat/<field>', value: 'Markdown' }` (per research.md R1), (7) call `updateWorkItem(context, id, pat, field, operations)`, (8) if `--json` flag: output `JSON.stringify({id: result.id, rev: result.rev, field: result.fieldName, value: result.fieldValue})` (matching existing `set-field` JSON output pattern), otherwise write confirmation: `"Updated work item <id>: <field> set as markdown\n"` (FR-016). Error handling follows `set-field.ts` pattern.

- [ ] T009 [US2] Register `set-md-field` command in `src/index.ts` — add `import { createSetMdFieldCommand } from './commands/set-md-field.js'` and `program.addCommand(createSetMdFieldCommand())` following the existing pattern.

**Checkpoint**: `azdo set-md-field <id> <field> "content"` works end-to-end. Field is updated with markdown content and `multilineFieldsFormat` is set to "Markdown". `--json` flag outputs structured JSON.

---

## Phase 5: User Story 3 — Set a Markdown Field from File (Priority: P2)

**Goal**: Users can run `azdo set-md-field <id> <field> --file <path>` to upload markdown content from a file on disk to a work item field.

**Independent Test**: Create a `.md` file with rich markdown content, run `set-md-field` with `--file`, and verify the full content appears in the work item.

**Dependencies**: Requires Phase 4 (US2) — extends the `set-md-field` command.

### Implementation for User Story 3

- [ ] T010 [US3] Add `--file` option to `set-md-field` command in `src/commands/set-md-field.ts` — add `.option('--file <path>', 'read markdown content from file')` to the command definition. Update the content resolution logic: (1) if both inline content AND `--file` are provided → error: `"Error: Cannot specify both inline content and --file. Use one or the other."` (FR-008), (2) if `--file` is provided → validate file exists using `node:fs` `existsSync()` (if not: `"Error: File not found: \"<path>\""`) → read file content using `readFileSync(path, 'utf-8')` (if read fails: `"Error: Cannot read file: \"<path>\""`) → use file content as markdown source (FR-007, FR-011), (3) if inline content is provided → use inline (existing behavior), (4) if neither → error (existing behavior, will be updated in US4). Update the error message for "no content" to include `--file` mention.

**Checkpoint**: `azdo set-md-field <id> <field> --file ./notes.md` works. Empty files clear the field. Missing files produce clear errors. Conflicting inline + `--file` is rejected.

---

## Phase 6: User Story 4 — Set a Markdown Field from Stdin (Priority: P2)

**Goal**: Users can pipe markdown content via stdin (e.g., `cat notes.md | azdo set-md-field <id> <field>`) and the command auto-detects and reads from stdin when no inline content or `--file` is provided.

**Independent Test**: Run `echo "# Piped Content" | azdo set-md-field <workItemId> System.Description` and verify the field is updated.

**Dependencies**: Requires Phase 5 (US3) — extends content resolution in `set-md-field`.

### Implementation for User Story 4

- [ ] T011 [US4] Add stdin auto-detection to `set-md-field` command in `src/commands/set-md-field.ts` — update the content resolution logic to handle stdin as the fallback source (per research.md R4, FR-012, FR-013, FR-014). After checking inline content and `--file`: (1) check `process.stdin.isTTY` — if `undefined` (piped input available), read all stdin data by collecting chunks: `const chunks: Buffer[] = []; for await (const chunk of process.stdin) chunks.push(chunk); const stdinContent = Buffer.concat(chunks).toString('utf-8').trimEnd();` (2) if stdin content is non-empty → use as markdown source, (3) if `process.stdin.isTTY` is `true` (interactive terminal, no pipe) → error: `"Error: No content provided. Provide markdown as an argument, via --file, or pipe through stdin."` (FR-013). Precedence is: inline > `--file` > stdin (FR-014). Note: since inline and `--file` are checked first, stdin is only read when both are absent.

**Checkpoint**: Full content source resolution works: inline, `--file`, and stdin. Running with no content source in an interactive terminal shows helpful error. Piped content is consumed correctly.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify the full feature works together and passes all quality checks

- [ ] T012 Verify build passes by running `npm run build` — ensure tsup bundles successfully with the new `node-html-markdown` dependency and both new commands
- [ ] T013 Run `npm run lint && npm run typecheck` to ensure all new code passes linting and strict TypeScript type checking

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational (T002 for shared resolveContext)
- **US2 (Phase 4)**: Depends on Foundational (T002) — independent of US1
- **US3 (Phase 5)**: Depends on US2 (extends set-md-field command)
- **US4 (Phase 6)**: Depends on US3 (extends content resolution in same file)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Independent — `get-md-field` has no dependency on `set-md-field`
- **US2 (P1)**: Independent — `set-md-field` has no dependency on `get-md-field`
- **US3 (P2)**: Extends US2 — adds `--file` option to existing `set-md-field`
- **US4 (P2)**: Extends US3 — adds stdin fallback to content resolution in `set-md-field`

### Within Each User Story

- Services before commands (T003, T004 before T006)
- API client changes before commands (T005 before T006)
- Command creation before registration (T006 before T007, T008 before T009)

### Parallel Opportunities

- **T003 + T004**: HTML detection and MD conversion services can be built in parallel (different files)
- **US1 + US2**: After Foundational phase, US1 (get-md-field) and US2 (set-md-field) can proceed in parallel (completely independent commands)
- **T012 + T013**: Build and lint checks can run in parallel

---

## Parallel Example: User Story 1

```bash
# These two service modules can be built in parallel (different files, no dependencies):
Task T003: "Create HTML detection service in src/services/html-detect.ts"
Task T004: "Create HTML-to-markdown conversion wrapper in src/services/md-convert.ts"

# Then sequentially:
Task T005: "Add getWorkItemFieldValue function to src/services/azdo-client.ts"
Task T006: "Create get-md-field command in src/commands/get-md-field.ts" (depends on T003, T004, T005)
Task T007: "Register get-md-field command in src/index.ts"
```

## Parallel Example: US1 + US2 Concurrent

```bash
# After T001 (setup) + T002 (foundational), both streams can run simultaneously:

# Stream A (US1 - get-md-field):
T003 + T004 (parallel) → T005 → T006 → T007

# Stream B (US2 - set-md-field):
T008 → T009

# Then sequentially: T010 (US3) → T011 (US4) → T012 + T013 (parallel polish)
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup (install dependency)
2. Complete Phase 2: Foundational (extract resolveContext)
3. Complete Phase 3: User Story 1 (get-md-field)
4. Complete Phase 4: User Story 2 (set-md-field inline)
5. **STOP and VALIDATE**: Both commands work independently. Users can read and write markdown fields.
6. Deploy/demo if ready — core read-write loop is complete

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (get-md-field) → Test independently → Can read markdown fields (MVP read)
3. Add US2 (set-md-field inline) → Test independently → Can write markdown fields (MVP write)
4. Add US3 (--file support) → Test independently → File-based workflows enabled
5. Add US4 (stdin support) → Test independently → Pipeline composability enabled
6. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US2 are both P1 but independent — can be built in either order or in parallel
- US3 and US4 are incremental extensions of US2, modifying the same file sequentially
- `resolveContext` is extracted to `src/services/context.ts` (Constitution Principle III) and shared by `set-field`, `get-md-field`, and `set-md-field`
- Commit after each phase checkpoint for clean git history
