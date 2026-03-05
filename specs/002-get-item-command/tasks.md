# Tasks: Get Work Item Command

**Input**: Design documents from `/specs/002-get-item-command/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in spec. Test tasks omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependency and create directory structure

- [ ] T001 Install @napi-rs/keyring as a runtime dependency in package.json
- [ ] T002 Create directory structure: src/commands/, src/services/, src/types/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types and API client that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 [P] Define WorkItem, AzdoContext, and AuthCredential interfaces in src/types/work-item.ts per data-model.md (WorkItem: id, rev, title, state, type, assignedTo, description, areaPath, iterationPath, url; AzdoContext: org, project; AuthCredential: pat, source)
- [ ] T004 [P] Implement Azure DevOps REST client in src/services/azdo-client.ts: getWorkItem(context: AzdoContext, id: number, pat: string) function using fetch() with Basic auth header (Base64 of ":{pat}"), API v7.1 endpoint `https://dev.azure.com/{org}/{project}/_apis/wit/workitems/{id}?api-version=7.1`, map API response fields to WorkItem interface, throw typed errors for 401/403/404/network failures

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Retrieve Work Item with Explicit Org/Project (Priority: P1) MVP

**Goal**: A developer can run `azdo get-item <id> --org <org> --project <project>` with AZDO_PAT env var and see work item details

**Independent Test**: Run `AZDO_PAT=<pat> azdo get-item 12345 --org myorg --project myproject` and verify work item fields are displayed to stdout

### Implementation for User Story 1

- [ ] T005 [US1] Implement PAT resolution from AZDO_PAT environment variable in src/services/auth.ts: export resolvePat() that reads process.env.AZDO_PAT and returns AuthCredential with source 'env', or returns null if not set
- [ ] T006 [US1] Create get-item command definition in src/commands/get-item.ts: register with commander as subcommand of program, define `<id>` positional argument, `--org <org>` option, `--project <project>` option, `--short` flag; validate id is positive integer (FR-010), validate --org and --project are both provided or both omitted (FR-009)
- [ ] T007 [US1] Implement work item display formatting in src/commands/get-item.ts: default mode shows all fields (ID, Type, Title, State, Assigned To, Area, Iteration, URL, Description) per CLI contract output format; --short mode shows core fields only with truncated description (first 3-5 lines with ellipsis); strip HTML tags from description for plain text output
- [ ] T008 [US1] Implement error handling in src/commands/get-item.ts: catch typed errors from azdo-client, write actionable messages to stderr per CLI contract error table (auth failure, not found, permission denied, network error, invalid ID, missing org/project pair), exit with code 1 on error, exit with code 0 on success
- [ ] T009 [US1] Register get-item command in src/index.ts: import and attach the get-item command to the program instance before program.parse()

**Checkpoint**: User Story 1 fully functional - can retrieve work items with explicit parameters and PAT env var

---

## Phase 4: User Story 2 - Git Remote Auto-Detection (Priority: P2)

**Goal**: A developer inside an Azure DevOps git repo can run `azdo get-item <id>` without --org/--project and have them auto-detected from the git remote URL

**Independent Test**: From a git repo with an Azure DevOps remote, run `azdo get-item 12345` (no --org/--project) and verify org/project are extracted correctly

### Implementation for User Story 2

- [ ] T010 [US2] Implement git remote URL parser in src/services/git-remote.ts: export parseAzdoRemote(url: string): AzdoContext | null that matches all 5 URL formats from research.md (HTTPS dev.azure.com, HTTPS legacy visualstudio.com, HTTPS legacy with DefaultCollection, SSH ssh.dev.azure.com, SSH legacy vs-ssh.visualstudio.com), extract org and project, return null for non-Azure URLs
- [ ] T011 [US2] Implement git remote reader in src/services/git-remote.ts: export detectAzdoContext(): AzdoContext that runs `git remote get-url origin` via child_process.execSync, passes result to parseAzdoRemote, throws descriptive error if not in a git repo (FR-008), throws descriptive error if remote is not an Azure DevOps URL (FR-007)
- [ ] T012 [US2] Integrate git remote detection into get-item command in src/commands/get-item.ts: when --org and --project are not provided, call detectAzdoContext() to resolve them; surface git-remote errors to stderr per CLI contract error messages

**Checkpoint**: User Stories 1 AND 2 both work independently

---

## Phase 5: User Story 3 - Interactive PAT Prompt with Credential Persistence (Priority: P3)

**Goal**: A developer without AZDO_PAT set is prompted to paste a PAT, which is stored in Windows Credential Manager for reuse

**Independent Test**: Unset AZDO_PAT, run `azdo get-item 12345 --org myorg --project myproject`, verify prompt appears, paste PAT, verify work item displayed, run again and verify no prompt (credential reused)

### Implementation for User Story 3

- [ ] T013 [P] [US3] Implement credential store wrapper in src/services/credential-store.ts: export getPat(): Promise<string | null> and storePat(pat: string): Promise<void> using @napi-rs/keyring (service: 'azdo-cli', account: 'pat'); handle errors gracefully if credential manager unavailable (fall through to prompt)
- [ ] T014 [P] [US3] Implement interactive PAT prompt in src/services/auth.ts: export promptForPat(): Promise<string | null> using Node.js readline with process.stdin.setRawMode(true) for masked input; check process.stdin.isTTY first, return null if not a TTY; handle Ctrl+C cancellation; display "Enter your Azure DevOps PAT: " prompt with asterisk masking
- [ ] T015 [US3] Extend resolvePat() in src/services/auth.ts to implement full PAT resolution chain (FR-013): (1) check AZDO_PAT env var, (2) check credential store via getPat(), (3) prompt interactively via promptForPat(), (4) if obtained via prompt, persist via storePat(); return AuthCredential with appropriate source; throw error if all sources fail with instructions per CLI contract

**Checkpoint**: All user stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all stories

- [ ] T016 Validate all error messages match CLI contract in specs/002-get-item-command/contracts/cli-contract.md against actual output from src/commands/get-item.ts
- [ ] T017 Run quickstart.md scenarios end-to-end: build, run with explicit args, run with git remote detection, run with interactive prompt

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2)
- **User Story 2 (Phase 4)**: Depends on Foundational (Phase 2). Integrates with US1 command file but is independently testable.
- **User Story 3 (Phase 5)**: Depends on Foundational (Phase 2). Integrates with US1 auth module but is independently testable.
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2 - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Phase 2 - Adds to get-item.ts from US1, so sequential after US1 recommended
- **User Story 3 (P3)**: Can start after Phase 2 - Adds to auth.ts from US1, so sequential after US1 recommended

### Within Each User Story

- Models/types before services
- Services before command integration
- Core implementation before error handling
- Story complete before moving to next priority

### Parallel Opportunities

- T003 and T004 can run in parallel (different files, no dependencies)
- T013 and T014 can run in parallel (different files within US3)
- User Stories 2 and 3 could theoretically run in parallel on different branches, but both modify files from US1

---

## Parallel Example: Phase 2

```bash
# Launch foundational tasks together:
Task: "T003 Define types in src/types/work-item.ts"
Task: "T004 Implement AzDO client in src/services/azdo-client.ts"
```

## Parallel Example: User Story 3

```bash
# Launch independent US3 tasks together:
Task: "T013 Credential store wrapper in src/services/credential-store.ts"
Task: "T014 Interactive PAT prompt in src/services/auth.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational (T003-T004)
3. Complete Phase 3: User Story 1 (T005-T009)
4. **STOP and VALIDATE**: Test with `AZDO_PAT=<pat> azdo get-item <id> --org <org> --project <project>`
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational (T001-T004) -> Foundation ready
2. Add User Story 1 (T005-T009) -> Test independently -> MVP!
3. Add User Story 2 (T010-T012) -> Test independently -> Git remote auto-detection works
4. Add User Story 3 (T013-T015) -> Test independently -> Interactive login works
5. Polish (T016-T017) -> All stories validated end-to-end

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- HTML stripping in T007 needed because Azure DevOps stores descriptions as HTML
