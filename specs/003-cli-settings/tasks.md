# Tasks: CLI Settings

**Input**: Design documents from `/specs/003-cli-settings/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Type definitions shared across all user stories

- [ ] T001 Add `CliConfig` interface and extend `WorkItem` with `extraFields` in src/types/work-item.ts. `CliConfig` has optional fields: `org?: string`, `project?: string`, `fields?: string[]`. `WorkItem` gets `extraFields: Record<string, string> | null`.

---

## Phase 2: Foundational (Config Store Service)

**Purpose**: Core config persistence layer that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [ ] T002 Implement config store service in src/services/config-store.ts. Must export: `getConfigPath(): string` (returns `path.join(os.homedir(), '.azdo', 'config.json')`), `loadConfig(): CliConfig` (reads and parses JSON, returns `{}` on missing/corrupt file with stderr warning on corrupt), `saveConfig(config: CliConfig): void` (writes JSON with `mkdirSync({ recursive: true })`, `JSON.stringify(data, null, 2)`), `getConfigValue(key: string): string | string[] | undefined`, `setConfigValue(key: string, value: string): void` (for `fields` key, split comma-separated string into array), `unsetConfigValue(key: string): void`. Use synchronous `node:fs` I/O per research.md R3. Validate keys against allowlist `['org', 'project', 'fields']`, throw on unknown keys.

- [ ] T003 Add unit tests for config store in tests/unit/config-store.test.ts. Test: load from nonexistent file returns empty config, set/get/unset cycle for each key type (string keys `org`/`project`, array key `fields`), corrupt file handling (warns to stderr, returns empty), unknown key rejection, empty value treated as unset, `fields` comma-separated parsing (e.g., `"System.Tags,Microsoft.VSTS.Common.Priority"` becomes `["System.Tags", "Microsoft.VSTS.Common.Priority"]`). Use `tmp` directories for test isolation.

**Checkpoint**: Config store ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Set Default Organization and Project (Priority: P1) MVP

**Goal**: Users can save default org/project and have `get-item` use them as fallback when no flags or git remote are available.

**Independent Test**: Run `azdo config set org myorg && azdo config set project myproject`, then run `azdo get-item 12345` from a non-Azure-DevOps directory and verify the saved defaults are used.

### Implementation for User Story 1

- [ ] T004 [US1] Create config command group in src/commands/config.ts. Create a commander.js command group `config` with description "Manage CLI settings". Implement the `set` subcommand: accepts `<key>` and `<value>` arguments, validates key against allowlist, calls `setConfigValue`, outputs confirmation per contracts/cli-contract.md (`Set "org" to "myorganization"`). Support `--json` flag for JSON output. Exit code 0 on success, 1 on error (unknown key). Follow the pattern of existing commands in src/commands/get-item.ts and src/commands/clear-pat.ts.

- [ ] T005 [US1] Register config command in src/index.ts. Import `createConfigCommand` from `./commands/config.js` and add it via `program.addCommand(createConfigCommand())`, following the existing pattern for `get-item` and `clear-pat`.

- [ ] T006 [US1] Modify context resolution in src/commands/get-item.ts to fall back to saved config defaults. In the `get-item` action handler, after the existing check for explicit `--org`/`--project` flags and before the git remote detection, add config fallback. The resolution order must be: (1) explicit flags, (2) git remote auto-detection (existing `detectAzdoContext()`), (3) saved defaults via `loadConfig()`. If git remote detection fails (throws) and config has both `org` and `project`, use config values. Update the `hasOrg !== hasProject` validation to also account for partial config (require both org and project to be resolvable from any combination of sources). Import `loadConfig` from `../services/config-store.js`.

**Checkpoint**: User Story 1 complete. Users can `config set org/project` and have `get-item` use saved defaults as fallback.

---

## Phase 4: User Story 2 - View and Manage Saved Settings (Priority: P2)

**Goal**: Users can view all settings, query individual settings, and remove settings.

**Independent Test**: Run `azdo config set org myorg`, then `azdo config list` to see it, `azdo config get org` to see the value, and `azdo config unset org` to remove it.

### Implementation for User Story 2

- [ ] T007 [US2] Add `get` subcommand to src/commands/config.ts. Accepts `<key>` argument, validates key against allowlist, calls `getConfigValue`. If value exists: output the raw value (human-readable) or `{ "key": "...", "value": "..." }` (JSON). If not set: output `Setting "key" is not configured.` (human-readable) or `{ "key": "...", "value": null }` (JSON). Exit code 0 always. Per contracts/cli-contract.md.

- [ ] T008 [P] [US2] Add `list` subcommand to src/commands/config.ts. Takes no arguments. Calls `loadConfig()`. If config is empty: output `No settings configured.` (human-readable). Otherwise: display each key-value pair in tabular format (`org       myorganization`). For `fields` array, join with commas. Support `--json` flag to output the full config object. Exit code 0 always. Per contracts/cli-contract.md.

- [ ] T009 [US2] Add `unset` subcommand to src/commands/config.ts. Accepts `<key>` argument, validates key against allowlist, calls `unsetConfigValue`. Output `Unset "key"` (human-readable) or `{ "key": "...", "unset": true }` (JSON). Exit code 0 always (even if key wasn't set). Per contracts/cli-contract.md.

**Checkpoint**: User Stories 1 AND 2 complete. Full config CRUD is functional.

---

## Phase 5: User Story 3 - Configure Additional Fields for Get-Item (Priority: P3)

**Goal**: Users can configure additional Azure DevOps work item fields to display alongside defaults in `get-item` output.

**Independent Test**: Run `azdo config set fields "System.Tags,Microsoft.VSTS.Common.Priority"`, then `azdo get-item <id>` and verify Tags and Priority appear in output.

### Implementation for User Story 3

- [ ] T010 [US3] Modify `getWorkItem` in src/services/azdo-client.ts to accept an optional `extraFields` parameter (`string[]`). When provided, append the field names to the API URL as a `fields` query parameter (comma-separated list including the existing default fields: `System.Title,System.State,System.WorkItemType,System.AssignedTo,System.Description,Microsoft.VSTS.Common.AcceptanceCriteria,Microsoft.VSTS.TCM.ReproSteps,System.AreaPath,System.IterationPath`). Extract extra field values from the response `fields` object into `WorkItem.extraFields` as `Record<string, string>`, converting non-string values via `String()`. Silently omit fields not present in the response (FR-007).

- [ ] T011 [US3] Add `--fields` option to `get-item` command in src/commands/get-item.ts. Add `.option('--fields <fields>', 'comma-separated additional field reference names')`. In the action handler: resolve fields from (1) `--fields` flag (split by comma) or (2) `loadConfig().fields`. Pass resolved fields array to `getWorkItem()`. If no fields configured, pass `undefined` (preserving existing behavior per SC-004).

- [ ] T012 [US3] Update `formatWorkItem` in src/commands/get-item.ts to display extra fields. After the URL line and before the description, iterate over `workItem.extraFields` entries. For each field, extract a display label from the reference name (last segment after the last `.`, e.g., `System.Tags` becomes `Tags`, `Microsoft.VSTS.Common.Priority` becomes `Priority`). Output as `${label.padEnd(13)}${value}`. In `--short` mode, still show extra fields (they are user-configured and therefore always desired).

**Checkpoint**: All user stories complete. Full settings management with default org/project and additional fields.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge case handling, test coverage, and validation

- [ ] T013 [P] Add config command tests in tests/unit/config-commands.test.ts. Test all four subcommands (`set`, `get`, `list`, `unset`) with both human-readable and `--json` output. Test unknown key rejection. Test empty config list. Use temp directories to isolate config file I/O. Mock or override `getConfigPath` for test isolation.

- [ ] T014 [P] Add tests for get-item config integration in tests/unit/cli.test.ts. Test that `get-item` falls back to config when no flags and no git remote. Test that explicit flags override config. Test that git remote overrides config. Test `--fields` flag overrides saved fields.

- [ ] T015 Verify existing tests still pass by running `npm test`. Ensure SC-004 (zero disruption when no settings configured) by confirming all existing tests pass without modification.

- [ ] T016 Run quickstart.md validation: manually verify the commands in specs/003-cli-settings/quickstart.md work as documented.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T001) - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion
- **User Story 2 (Phase 4)**: Depends on Phase 3 (T004 creates config.ts that US2 extends)
- **User Story 3 (Phase 5)**: Depends on Phase 2 (config store). Can run in parallel with US2 since it modifies different files (azdo-client.ts, get-item.ts)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (Phase 2). Creates config.ts and modifies get-item.ts.
- **User Story 2 (P2)**: Depends on US1 (extends config.ts created in T004). Touches only config.ts.
- **User Story 3 (P3)**: Depends on Foundational (Phase 2). Can start after US1 since it modifies get-item.ts (which US1 also modifies). Safest to run after US1.

### Within Each User Story

- Types before services
- Services before commands
- Commands before integration modifications
- Story complete before moving to next priority

### Parallel Opportunities

- T003 (config-store tests) can be written in parallel with T002 if following TDD
- T007 and T008 within US2 touch the same file but T008 is marked [P] since `list` is independent of `get`
- T010 (azdo-client modification) and T011/T012 (get-item modifications) are sequential within US3
- T013 and T014 in Polish phase can run in parallel (different test files)

---

## Parallel Example: User Story 3

```
# These touch different files and can be researched in parallel:
T010: Modify getWorkItem in src/services/azdo-client.ts (API layer)
# Then sequentially:
T011: Add --fields option in src/commands/get-item.ts (command layer)
T012: Update formatWorkItem in src/commands/get-item.ts (display layer)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002-T003)
3. Complete Phase 3: User Story 1 (T004-T006)
4. **STOP and VALIDATE**: Test `config set` + `get-item` fallback independently
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational (T001-T003) -> Config store ready
2. User Story 1 (T004-T006) -> Test independently -> MVP!
3. User Story 2 (T007-T009) -> Test independently -> Full config management
4. User Story 3 (T010-T012) -> Test independently -> Additional fields support
5. Polish (T013-T016) -> Full test coverage and validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Zero new runtime dependencies - only `node:fs`, `node:path`, `node:os` (built-in)
- Synchronous file I/O for config operations per research.md R3
