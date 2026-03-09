# Tasks: Auto Markdown Display for Rich Text Fields

**Input**: Design documents from `/specs/006-auto-md-display/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included — the project uses vitest and existing tests cover similar functionality.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Extend shared types and config infrastructure to support the new `markdown` boolean setting.

- [ ] T001 [P] Add `markdown?: boolean` to `CliConfig` interface in `src/types/work-item.ts`
- [ ] T002 Add `markdown` entry to `SETTINGS` array with type `boolean` in `src/services/config-store.ts`
- [ ] T003 Add boolean parsing logic in `setConfigValue()` for the `markdown` key in `src/services/config-store.ts` (depends on T002)

**Checkpoint**: `azdo config set markdown true`, `azdo config get markdown`, `azdo config unset markdown`, and `azdo config list` all work correctly with the new boolean setting.

---

## Phase 2: User Story 1 — Configure Automatic Markdown Display (Priority: P1) 🎯 MVP

**Goal**: Users can set `markdown` in config and have `get-item` automatically convert all rich text fields to markdown without any extra flags.

**Independent Test**: Run `azdo config set markdown true` then `azdo get-item <id>` — Description should render as markdown (headings, bold, links preserved) instead of stripped HTML.

### Tests for User Story 1

- [ ] T004 [P] [US1] Add unit tests for boolean config setting (set/get/unset/list) in `tests/unit/config-store.test.ts`
- [ ] T005 [P] [US1] Create test file `tests/unit/get-item-markdown.test.ts` with tests for `formatWorkItem()` when markdown is `true`: verify Description uses `toMarkdown()` output instead of `stripHtml()` output

### Implementation for User Story 1

- [ ] T006 [US1] Import `toMarkdown` from `../services/md-convert.js` in `src/commands/get-item.ts`
- [ ] T007 [US1] Add `markdown: boolean` parameter to `formatWorkItem()` signature in `src/commands/get-item.ts` (depends on T006)
- [ ] T008 [US1] In `formatWorkItem()`, when `markdown` is `true`, use `toMarkdown(workItem.description)` instead of `stripHtml(workItem.description)` for the Description field in `src/commands/get-item.ts` (depends on T007)
- [ ] T009 [US1] In the `get-item` command action, read `loadConfig().markdown` and pass it to `formatWorkItem()` in `src/commands/get-item.ts` (depends on T008)

**Checkpoint**: `azdo config set markdown true && azdo get-item <id>` renders Description as markdown. Without the config, behavior is unchanged.

---

## Phase 3: User Story 2 — Per-Command Markdown Toggle (Priority: P2)

**Goal**: Users can pass `--markdown` or `--no-markdown` flags to `get-item` for per-invocation control, overriding the config setting.

**Independent Test**: Run `azdo get-item <id> --markdown` (no config set) — Description renders as markdown. Run `azdo config set markdown true && azdo get-item <id> --no-markdown` — Description renders as stripped HTML.

### Tests for User Story 2

- [ ] T010 [P] [US2] Add tests in `tests/unit/get-item-markdown.test.ts` for flag resolution: `--markdown` flag overrides config `false`, `--no-markdown` flag overrides config `true`, absent flag falls back to config value

### Implementation for User Story 2

- [ ] T011 [US2] Add `.option('--markdown', 'convert rich text fields to markdown')` to the `get-item` command definition in `src/commands/get-item.ts`
- [ ] T012 [US2] Implement three-state resolution logic in the command action: if `options.markdown` is `true` → use markdown, if `options.markdown` is `false` → don't use markdown, if `undefined` → fall back to `loadConfig().markdown ?? false` in `src/commands/get-item.ts` (depends on T011)

**Checkpoint**: All four combinations work: (config off + no flag), (config off + `--markdown`), (config on + no flag), (config on + `--no-markdown`).

---

## Phase 4: User Story 3 — Markdown Display for Extra Fields (Priority: P2)

**Goal**: When markdown mode is active, extra fields containing HTML are also converted to markdown; plain-text extra fields are unchanged.

**Independent Test**: Run `azdo get-item <id> --fields Microsoft.VSTS.TCM.ReproSteps --markdown` — HTML extra fields render as markdown, plain-text extra fields are unaffected.

### Tests for User Story 3

- [ ] T013 [P] [US3] Add tests in `tests/unit/get-item-markdown.test.ts` for extra fields: HTML extra field is converted when markdown is `true`, plain-text extra field passes through unchanged, null/empty extra fields handled gracefully

### Implementation for User Story 3

- [ ] T014 [US3] In `formatWorkItem()`, when `markdown` is `true`, apply `toMarkdown()` to each extra field value (for HTML detection + conversion) in `src/commands/get-item.ts` (depends on T008)

**Checkpoint**: `azdo get-item <id> --fields Microsoft.VSTS.TCM.ReproSteps --markdown` shows HTML extra fields as markdown and plain-text extra fields unchanged.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Ensure quality, passing CI, and documentation.

- [ ] T015 Run `npm test` and fix any failing tests
- [ ] T016 Run `npm run lint` and fix any lint issues
- [ ] T017 Run `npm run build` and verify zero errors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **US1 (Phase 2)**: Depends on T001–T003 (config infrastructure)
- **US2 (Phase 3)**: Depends on T007 (formatWorkItem markdown parameter) — can overlap with US1 implementation
- **US3 (Phase 4)**: Depends on T008 (markdown branch in formatWorkItem) — can overlap with US2
- **Polish (Phase 5)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Setup only — **no dependencies on other stories**
- **User Story 2 (P2)**: Depends on US1 implementation (T007–T009) since it adds flags to the same command action
- **User Story 3 (P2)**: Depends on US1 implementation (T008) since it extends the markdown branch in formatWorkItem

### Within Each User Story

- Tests can be written in parallel with each other [P]
- Implementation tasks are sequential (each builds on prior)
- Tests should fail before implementation, pass after

### Parallel Opportunities

- T001 and T002 can run in parallel (different files)
- T004 and T005 can run in parallel (different test files)
- T010 and T013 can run in parallel with each other (same test file but independent test cases)
- US2 and US3 implementation can overlap if US1 T008 is complete

---

## Parallel Example: Setup Phase

```bash
# These two tasks modify different files and can run in parallel:
Task T001: "Add markdown?: boolean to CliConfig in src/types/work-item.ts"
Task T002: "Add markdown setting to SETTINGS array in src/services/config-store.ts"
```

## Parallel Example: User Story 1 Tests

```bash
# These test tasks are in different files and can run in parallel:
Task T004: "Boolean config tests in tests/unit/config-store.test.ts"
Task T005: "formatWorkItem markdown tests in tests/unit/get-item-markdown.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: User Story 1 (T004–T009)
3. **STOP and VALIDATE**: `azdo config set markdown true && azdo get-item <id>` shows markdown
4. Run `npm test && npm run lint && npm run build`

### Incremental Delivery

1. Setup → Config infrastructure ready
2. Add US1 → Test independently → Config-driven markdown display (MVP!)
3. Add US2 → Test independently → Per-command flag control
4. Add US3 → Test independently → Extra fields consistency
5. Polish → CI green, ready for PR

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Only 3 source files modified: `work-item.ts`, `config-store.ts`, `get-item.ts`
- 1 new test file: `get-item-markdown.test.ts`
- 1 existing test file extended: `config-store.test.ts`
- No new dependencies required
- Commit after each phase checkpoint
