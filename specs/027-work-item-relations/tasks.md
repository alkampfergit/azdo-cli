# Tasks: Work Item Relations Support

**Input**: Design documents from `/specs/027-work-item-relations/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Organization**: 3 user stories, ordered P1 → P2 → P3. Phase 2 (types) is foundational and required by all stories. Each story is independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: US1 = Relation types listing; US2 = Add/remove relations; US3 = List relations on work item

---

## Phase 1: Setup (Shared Infrastructure)

*No new project structure needed — all target files are pre-identified in plan.md.*

---

## Phase 2: Foundational (Type Definitions — Required by All Stories)

**Purpose**: TypeScript type definitions that all three user stories depend on. Must be complete before US1–US3 implementation.

**⚠️ CRITICAL**: All user story implementation tasks depend on these types.

- [x] T001 [P] Create `src/types/relations.ts` with `AzdoWorkItemRelationType`, `AzdoWorkItemRelationTypeListResponse`, `AzdoWorkItemRelation`, `WorkItemRelationType`, `WorkItemRelation`, `WorkItemRelationsResult` as specified in `specs/027-work-item-relations/data-model.md`
- [x] T002 [P] Extend `AzdoWorkItem` interface in `src/types/work-item.ts` with optional `relations?: AzdoWorkItemRelation[]` field (import `AzdoWorkItemRelation` from `../types/relations.js`)
- [x] T003 [P] Add integration-test env var helpers `AZDO_WI_WITH_RELATIONS`, `AZDO_WI_RELATION_SOURCE`, `AZDO_WI_RELATION_TARGET` to `tests/integration/helpers/integration-utils.ts` (number | null pattern, same as `AZDO_PR_ID`)

**Checkpoint**: `npm run build` passes. Foundation ready.

---

## Phase 3: User Story 1 — Discover Available Relation Types (Priority: P1) 🎯 MVP

**Goal**: `azdo relations types` lists all available work item relation types with their reference names.

**Independent Test**: Run `azdo relations types` against the test ADO org — output must include at least `Child`, `Parent`, `Related`.

### Implementation for User Story 1

- [x] T004 [P] [US1] Add private URL builder `buildRelationTypesUrl(context)` in `src/services/relations-client.ts` — builds `GET https://dev.azure.com/{org}/_apis/wit/workitemrelationtypes?api-version=7.1`
- [x] T005 [P] [US1] Add private mapper `mapRelationType(raw: AzdoWorkItemRelationType): WorkItemRelationType` in `src/services/relations-client.ts` — maps raw API type to CLI type, sets `usage`, `enabled`, `directional`
- [x] T006 [US1] Implement `getWorkItemRelationTypes(context, cred)` export in `src/services/relations-client.ts` — fetches all types, maps through `mapRelationType`, filters to `usage === 'workItemLink' && enabled !== false`
- [x] T007 [US1] Add `formatRelationTypes(types: WorkItemRelationType[])` and `createRelationsCommand()` with `types` subcommand in `src/commands/relations.ts` — human output: name padded + referenceName; `--json` output: JSON array; handles empty gracefully
- [x] T008 [US1] Register `createRelationsCommand()` in `src/index.ts` — add import and `program.addCommand(createRelationsCommand())`
- [x] T009 [P] [US1] Add integration test suite `describe('getWorkItemRelationTypes')` in `tests/integration/relations.test.ts` — guarded by `SKIP_AZDO`; verifies: returns array, includes Child/Parent/Related by name, `--json` valid, bad PAT throws

**Checkpoint**: `azdo relations types` on test org prints at least Child, Parent, Related.

---

## Phase 4: User Story 2 — Add or Remove a Relation (Priority: P2)

**Goal**: `azdo relations add <type> <id1> <id2>` and `azdo relations remove <type> <id1> <id2>` work correctly, with idempotency and clear error messages.

**Independent Test**: Run `azdo relations add child <AZDO_WI_RELATION_SOURCE> <AZDO_WI_RELATION_TARGET>`, verify success, then `azdo relations remove child <src> <tgt>`, verify removed. Both commands exit 0.

### Implementation for User Story 2

- [x] T010 [P] [US2] Add `resolveRelationType(context, cred, alias: string)` in `src/services/relations-client.ts` — calls `getWorkItemRelationTypes`, case-insensitively matches `alias` against `.name`, throws `UNKNOWN_RELATION_TYPE:<alias>` if not found; returns the matched `WorkItemRelationType`
- [x] T011 [P] [US2] Add `getWorkItemWithRelations(context, cred, id: number)` in `src/services/relations-client.ts` — `GET /{org}/{project}/_apis/wit/workitems/{id}?$expand=relations&api-version=7.1`; throws `NOT_FOUND` for 404
- [x] T012 [US2] Implement `addWorkItemRelation(context, cred, type: string, id1: number, id2: number)` in `src/services/relations-client.ts`:
  - Guard: if `id1 === id2` throw `SELF_RELATION`
  - Call `resolveRelationType` to get `referenceName`
  - Call `getWorkItemWithRelations(id1)` to check idempotency: if relation with matching `rel`+target URL already exists, return `{ status: 'already_exists', ... }`
  - Otherwise PATCH `id1` with `[{op:"add", path:"/relations/-", value:{rel:referenceName, url:"https://dev.azure.com/{org}/_apis/wit/workItems/{id2}"}}]`, Content-Type: `application/json-patch+json`
  - Return `{ status: 'added', type: displayName, referenceName, id1, id2 }`
- [x] T013 [US2] Implement `removeWorkItemRelation(context, cred, type: string, id1: number, id2: number)` in `src/services/relations-client.ts`:
  - Guard: if `id1 === id2` throw `SELF_RELATION`
  - Call `resolveRelationType` to get `referenceName`
  - Call `getWorkItemWithRelations(id1)` and find index of relation where `rel === referenceName` and URL ends with `/{id2}`
  - If not found, return `{ status: 'not_found', ... }`
  - PATCH `id1` with `[{op:"remove", path:"/relations/{index}"}]`
  - Return `{ status: 'removed', type: displayName, referenceName, id1, id2 }`
- [x] T014 [US2] Add `add` and `remove` subcommands to `createRelationsCommand()` in `src/commands/relations.ts`:
  - Both take `<type> <id1> <id2>` positional args (parsed as numbers) + `--json` flag
  - Human output: `Added relation: #1000 --[Child]--> #2000` / `Relation already exists: ...` / `Removed relation: ...` / `No relation of type '...' found between ...`
  - Error handling: `SELF_RELATION` → "cannot relate a work item to itself"; `UNKNOWN_RELATION_TYPE` → "unknown relation type '...'. Run 'azdo relations types' to see valid names."; `NOT_FOUND` → "work item #N not found"
- [x] T015 [P] [US2] Add integration test suites `describe('addWorkItemRelation')` and `describe('removeWorkItemRelation')` in `tests/integration/relations.test.ts` — guarded by `AZDO_WI_RELATION_SOURCE && AZDO_WI_RELATION_TARGET`; self-healing round-trip: add → verify idempotent → remove → verify not_found

**Checkpoint**: `azdo relations add child <src> <tgt>` and `azdo relations remove child <src> <tgt>` succeed on test org.

---

## Phase 5: User Story 3 — List Relations on a Work Item (Priority: P3)

**Goal**: `azdo relations list <id>` shows all work-item-link relations with type name, target ID, and target title.

**Independent Test**: Run `azdo relations list <AZDO_WI_WITH_RELATIONS>` — output must include at least one relation with a type name and target ID. `--json` output must be valid JSON with `workItemId` and `relations` fields.

### Implementation for User Story 3

- [x] T016 [P] [US3] Add `buildBatchWorkItemsUrl(context, ids: number[])` private helper in `src/services/relations-client.ts` — builds `GET /{org}/{project}/_apis/wit/workitems?ids={csv}&fields=System.Id,System.Title&api-version=7.1`
- [x] T017 [US3] Implement `listWorkItemRelations(context, cred, id: number)` in `src/services/relations-client.ts`:
  - GET work item with `$expand=relations`; throw `NOT_FOUND` if 404
  - Filter relations to `workItemLink` usage (cross-reference with `getWorkItemRelationTypes` or filter out known resource-link `rel` prefixes: `AttachedFile`, `Hyperlink`, `ArtifactLink`)
  - Parse target IDs from relation URLs
  - Batch-fetch titles using `buildBatchWorkItemsUrl`
  - Return `WorkItemRelationsResult` with `workItemId` and mapped `WorkItemRelation[]`
- [x] T018 [US3] Add `list` subcommand to `createRelationsCommand()` in `src/commands/relations.ts`:
  - Takes `<id>` positional arg + `--json` flag
  - Human output: table of `[TypeName]  #targetId  Title` lines, or "Work item #N has no relations." when empty
  - JSON output: `WorkItemRelationsResult` shape from contracts/cli-commands.md
- [x] T019 [P] [US3] Add integration test suite `describe('listWorkItemRelations')` in `tests/integration/relations.test.ts` — guarded by `AZDO_WI_WITH_RELATIONS`; verifies: returns array, each entry has `rel`, `relName`, `targetId`, `targetTitle`; empty-relations case returns empty array; bad ID throws NOT_FOUND

**Checkpoint**: `azdo relations list <id>` on test org shows at least one relation with type name and target ID.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T020 [P] Add unit test file `tests/unit/relations-client.test.ts` — unit tests for `mapRelationType`, `resolveRelationType` (mock `getWorkItemRelationTypes`), add idempotency logic, remove index lookup, self-relation guard
- [x] T021 Run full verification: `npm run lint && npm test && npm run build` — all must pass with zero errors and zero warnings
- [x] T022 [P] Update `README.md` — add `azdo relations` to the commands section with `types`, `add`, `remove`, `list` subcommands and usage examples (constitution requirement)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No external dependencies — start immediately
- **US1 (Phase 3)**: Depends on T001 (types in `relations.ts`), T002 (`work-item.ts` extended), T003 (env vars)
- **US2 (Phase 4)**: Depends on T001 (types), T006 (`getWorkItemRelationTypes` for alias resolution)
- **US3 (Phase 5)**: Depends on T001 (types), T006 (`getWorkItemRelationTypes` for usage filtering), T011 (`getWorkItemWithRelations`)
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Depends on T001, T002, T003. Fully independent.
- **US2 (P2)**: Depends on T001, T006. Can start after T006 is done.
- **US3 (P3)**: Depends on T001, T006, T011. Can start after T011 is done.

### Within Each User Story

- T004, T005 [P] — URL builder and mapper are independent
- T006 depends on T004, T005
- T007 depends on T006
- T008 depends on T007
- T010, T011 [P] — alias resolver and WI fetcher are independent
- T012 depends on T010, T011
- T013 depends on T010, T011
- T016 [P] — independent of T010–T013

### Parallel Opportunities

Phase 2: T001, T002, T003 can all run in parallel (different files)
Phase 3: T004 and T005 parallel; T009 test skeleton parallel with T006–T007
Phase 4: T010 and T011 parallel; T015 test skeleton parallel with T012–T014
Phase 5: T016 parallel with early phases; T019 test skeleton parallel with T017–T018

---

## Parallel Example: User Story 2

```
Parallel batch 1 (foundational already done):
  T010 — resolveRelationType (relations-client.ts)
  T011 — getWorkItemWithRelations (relations-client.ts)

Sequential:
  T012 — addWorkItemRelation [needs T010, T011]
  T013 — removeWorkItemRelation [needs T010, T011]
  T014 — add/remove subcommands (relations.ts) [needs T012, T013]

Parallel:
  T015 — integration tests
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: T001–T003 (types + env vars)
2. Complete Phase 3: T004–T009 (`types` subcommand + integration test)
3. **STOP and VALIDATE**: `azdo relations types` shows at least Child/Parent/Related

### Incremental Delivery

1. Phase 2 (T001–T003) → Types ready
2. US1 (T004–T009) → `types` subcommand ✅
3. US2 (T010–T015) → `add` + `remove` subcommands ✅
4. US3 (T016–T019) → `list` subcommand ✅
5. Polish (T020–T022) → Tests clean, README updated ✅

---

## Notes

- [P] tasks = different files, no shared state, safe to parallelize
- `add` and `remove` share `resolveRelationType` and `getWorkItemWithRelations` — implement those first (T010, T011)
- Integration tests for add/remove MUST be self-healing (add then remove in same test, or vice versa) to leave test data unchanged
- PAT needs `vso.work_write` scope for add/remove tests; document this in test guards
- No TDD was requested; unit tests are in Polish phase (T020) for mapping functions only
