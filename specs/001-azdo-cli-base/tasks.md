# Tasks: AzDO CLI Base

**Input**: Design documents from `/specs/001-azdo-cli-base/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Added for core CLI behaviors using vitest per constitution.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, TypeScript configuration, and tooling setup

- [ ] T001 Initialize npm project with package.json — set name to `azdo-cli`, version `0.1.0`, type `module`, bin `{"azdo": "./dist/index.js"}`, files `["dist"]` in package.json
- [ ] T002 Install dev dependencies: typescript, commander, tsup, vitest, eslint, prettier in package.json
- [ ] T003 [P] Configure TypeScript strict mode in tsconfig.json — strict: true, ES2022 target, NodeNext module resolution, outDir dist
- [ ] T004 [P] Configure tsup bundler in tsup.config.ts — single entry src/index.ts, format esm, target node20, banner with shebang `#!/usr/bin/env node`, noExternal to bundle commander.js
- [ ] T005 [P] Configure ESLint with TypeScript parser in eslint.config.js
- [ ] T006 [P] Configure Prettier in .prettierrc
- [ ] T007 Add npm scripts to package.json — build, lint, typecheck, format, test

**Checkpoint**: Project skeleton compiles with `npm run build` (empty entry point)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core CLI skeleton that all user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T008 Create version utility in src/version.ts — read and export version string from package.json
- [ ] T009 Create CLI entry point in src/index.ts — import commander, create program with name `azdo`, description `Azure DevOps CLI tool`, wire version from src/version.ts

**Checkpoint**: `npm run build` produces dist/index.js; `node dist/index.js` runs without errors

---

## Phase 3: User Story 2 - Check Version (Priority: P1) 🎯 MVP

**Goal**: Users can run `azdo --version` or `azdo -v` to see the installed version number

**Independent Test**: Run `node dist/index.js --version` and verify it outputs `0.1.0`

### Implementation for User Story 2

- [ ] T010 [US2] Configure commander `.version()` with version string and `-v` short flag in src/index.ts
- [ ] T011 [US2] Verify version output matches package.json version — build and run `node dist/index.js --version`, confirm output is `0.1.0`

**Checkpoint**: `azdo --version` and `azdo -v` both output `0.1.0` and exit with code 0

---

## Phase 4: User Story 3 - View Help Information (Priority: P1)

**Goal**: Users can run `azdo --help`, `azdo -h`, or `azdo` (no args) to see usage information

**Independent Test**: Run `node dist/index.js --help` and verify it displays usage, description, and available options

### Implementation for User Story 3

- [ ] T012 [US3] Configure commander help output — ensure program displays name, description, and all options in src/index.ts
- [ ] T013 [US3] Implement no-arguments behavior — display help output when `azdo` is invoked with no arguments in src/index.ts
- [ ] T014 [US3] Implement unknown option error handling — display error message to stderr and help output to stdout, exit with code 1, in src/index.ts

**Checkpoint**: `azdo --help`, `azdo -h`, `azdo` (no args) display help and exit 0; `azdo --foo` displays error + help and exits 1

---

## Phase 5: User Story 1 - Install CLI Globally (Priority: P1)

**Goal**: Users can `npm install -g azdo-cli` and the `azdo` command is available in their PATH

**Independent Test**: Run `npm link` then `azdo --version` from any directory

### Implementation for User Story 1

- [ ] T015 [US1] Verify package.json bin field maps `azdo` to `./dist/index.js` and files field includes `["dist"]` in package.json
- [ ] T016 [US1] Verify built output has executable shebang — confirm dist/index.js starts with `#!/usr/bin/env node` after `npm run build`
- [ ] T017 [US1] Test global install via `npm link` — run `npm link`, then verify `azdo --version`, `azdo --help`, and `azdo --foo` all work correctly from outside the project directory, and verify `npx azdo-cli --version` works without global install

**Checkpoint**: `npm link && azdo --version` works from any directory; `npm unlink -g azdo-cli` cleans up

---

## Phase 6: User Story 4 - Automated Build and Publish (Priority: P2)

**Goal**: GitHub Actions pipeline builds on every push, publishes to npm on all branches, creates GitHub Release only on master

**Independent Test**: Push to a branch and verify the pipeline builds and publishes; push to master and verify a GitHub Release is created

### Implementation for User Story 4

- [ ] T018 [US4] Create GitHub Actions workflow in .github/workflows/ci.yml — trigger on push to all branches, checkout, setup Node.js LTS, npm ci, lint, typecheck, build
- [ ] T019 [US4] Add npm publish step to .github/workflows/ci.yml — publish with `latest` tag on master, `next` tag on develop, `dev` tag on feature branches; derive pre-release version suffix from branch name and run number for non-master; ensure pipeline fails with clear error if version already exists on registry
- [ ] T020 [US4] Add GitHub Release step to .github/workflows/ci.yml — create release with version tag only when branch is master, using built artifacts

**Checkpoint**: Pipeline runs on push; master builds publish as `latest` with a GitHub Release; non-master builds publish with pre-release tags

---

## Phase 7: Tests

**Purpose**: Unit tests for all CLI behaviors using vitest

- [ ] T021 [P] Create test file tests/unit/cli.test.ts — test `azdo --version` outputs correct version and exits 0
- [ ] T022 [P] Add test for `azdo --help` outputs usage information and exits 0 in tests/unit/cli.test.ts
- [ ] T023 [P] Add test for `azdo` with no arguments displays help and exits 0 in tests/unit/cli.test.ts
- [ ] T024 [P] Add test for `azdo --foo` unknown option outputs error to stderr and exits 1 in tests/unit/cli.test.ts

**Checkpoint**: `npm test` passes all CLI behavior tests

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [ ] T025 [P] Update .gitignore with entries for dist/, node_modules/, and build artifacts
- [ ] T026 Run quickstart.md validation — follow all steps in specs/001-azdo-cli-base/quickstart.md and verify they work end-to-end
- [ ] T027 Verify CLI output matches contracts/cli-interface.md — compare actual output of --version, --help, no-args, and unknown option against the contract

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US2 (Phase 3)**: Depends on Foundational (Phase 2)
- **US3 (Phase 4)**: Depends on US2 (Phase 3) — extends the same src/index.ts
- **US1 (Phase 5)**: Depends on US3 (Phase 4) — needs complete CLI to verify installation
- **US4 (Phase 6)**: Depends on US1 (Phase 5) — needs working build to set up pipeline
- **Tests (Phase 7)**: Depends on US3 (Phase 4) — needs working CLI to test against
- **Polish (Phase 8)**: Depends on all user stories and tests being complete

### User Story Dependencies

- **User Story 2 (P1)**: First story — establishes the CLI with --version
- **User Story 3 (P1)**: Extends CLI in same file — depends on US2 for base setup
- **User Story 1 (P1)**: Verification story — depends on US2+US3 for complete CLI
- **User Story 4 (P2)**: Pipeline story — depends on working CLI (US1+US2+US3)

### Within Each User Story

- Core implementation before verification
- Story complete before moving to next priority

### Parallel Opportunities

- T003, T004, T005, T006 can all run in parallel (different config files)
- T021, T022, T023, T024 can all run in parallel (same test file but independent test cases)
- T025 can run in parallel with T026, T027
- US2 and US3 share src/index.ts so they must be sequential
- US4 tasks (T018, T019, T020) are sequential within the same workflow file

---

## Parallel Example: Phase 1 Setup

```bash
# Launch all config tasks together after T001+T002:
Task T003: "Configure TypeScript strict mode in tsconfig.json"
Task T004: "Configure tsup bundler in tsup.config.ts"
Task T005: "Configure ESLint in eslint.config.js"
Task T006: "Configure Prettier in .prettierrc"
```

---

## Implementation Strategy

### MVP First (User Stories 2+3 — Version & Help)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 2 (--version)
4. Complete Phase 4: User Story 3 (--help + error handling)
5. **STOP and VALIDATE**: Test CLI locally — `azdo --version`, `azdo --help`, `azdo`, `azdo --foo`
6. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Project compiles
2. Add US2 (--version) → Minimal CLI works
3. Add US3 (--help + errors) → Complete CLI behavior
4. Add US1 (install verification) → Confirmed installable
5. Add US4 (pipeline) → Automated distribution
6. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US2 and US3 share src/index.ts — must be sequential
- US4 pipeline tasks share ci.yml — must be sequential
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
