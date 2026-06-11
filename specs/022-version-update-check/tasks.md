---

description: "Task list for 022-version-update-check"
---

# Tasks: Check for new stable version on startup

**Input**: Design documents from `/specs/022-version-update-check/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/update-check.md

**Tests**: INCLUDED — the spec defines independent tests / measurable testing outcomes and `AGENTS.md` requires `npm test && npm run lint` to be green.

**Organization**: Grouped by user story. NOTE: all three stories are delivered by the **same** module (`src/services/update-check.ts`) wired once in `src/index.ts`; implementation tasks that touch those two files are therefore sequential (not `[P]`), while test files (different paths) are `[P]`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 (or SETUP/FOUND/POLISH)

## Path Conventions

Single project: `src/`, `tests/` at repository root.

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 [SETUP] Confirm the toolchain builds clean before changes: `npm run build && npm run lint` (baseline green).

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: Completes the testable core that all three stories rely on. No story work begins until this phase is done.

- [ ] T002 [FOUND] Create `src/services/update-check.ts` skeleton: module-level constants `THROTTLE_MS = 10*60*1000`, `FETCH_TIMEOUT_MS = 1500`, `REGISTRY_URL = "https://registry.npmjs.org/azdo-cli/latest"`; export the `UpdateCheckDeps` interface and the `getUpdateNotice(opts?)` + `isNewer(latest, current)` signatures per `contracts/update-check.md`. Strict types, no `any`.
- [ ] T003 [FOUND] Implement `isNewer(latest, current)`: dotted numeric compare (major/minor/patch), treat a pre-release suffix as lower precedence, return `false` on unparseable input (FR-006, FR-010).
- [ ] T004 [FOUND] Implement cache I/O + type guard inside `update-check.ts`: default `readCache`/`writeCache` against `~/.azdo/update-check.json` (build the path from `os.homedir()`, mkdir the dir like `config-store.ts`); a `parseCache(raw): {lastCheck:number, latestVersion:string} | null` guard that returns `null` on missing/corrupt/wrong-shape input (FR-003, FR-008, data-model).
- [ ] T005 [FOUND] Implement default `fetchLatest()`: native `fetch(REGISTRY_URL)` with an `AbortController` timeout of `FETCH_TIMEOUT_MS`, parse `.version` (string) from JSON, return it or `null`; never throw (R1, R2, FR-007).

**Checkpoint**: Pure helpers (`isNewer`, cache parse, fetch wrapper) exist and are unit-testable with injected deps.

---

## Phase 3: User Story 1 - Notified when a newer stable version exists (Priority: P1) 🎯 MVP

**Goal**: After a command, when a fresh successful check finds a newer stable version, emit one stderr line; otherwise nothing.

**Independent Test**: Pin running version below a stubbed registry version → `getUpdateNotice` returns the notice; equal/newer or pre-release → returns `null`.

### Tests for User Story 1

- [ ] T006 [P] [US1] `tests/unit/update-check.test.ts` — `isNewer`: newer/equal/older/pre-release/unparseable cases (write first, expect fail).
- [ ] T007 [P] [US1] In `tests/unit/update-check.test.ts` — `getUpdateNotice` returns the one-line notice (containing `current → latest` and the upgrade command) when throttle elapsed and stubbed `fetchLatest` returns a newer version; returns `null` when version is equal/older (C4, C5, C8).

### Implementation for User Story 1

- [ ] T008 [US1] In `update-check.ts`, implement the core flow of `getUpdateNotice`: read+parse cache → (throttle handled in US2) → call `fetchLatest` → on success write cache and, if `isNewer(latest, current)`, build the `UpdateNotice` line; return the string or `null`. Use injected `currentVersion` (default = `version` from `src/version.ts`). Wrap everything so it never throws (C4–C8, FR-005/007/010).
- [ ] T009 [US1] Wire the caller in `src/index.ts`: switch `program.parse()` → `await program.parseAsync()`; after the command runs, call `getUpdateNotice(...)` and, if it returns a string, `process.stderr.write(notice + "\n")`. Notice prints **after** command output; exit code unchanged (contract: Caller).

**Checkpoint**: Running an outdated build shows exactly one upgrade line on stderr after output; current build shows nothing.

---

## Phase 4: User Story 2 - Throttled and never slows commands down (Priority: P1)

**Goal**: ≤1 registry lookup per 10-min window; a failed check does not reset the throttle; no perceptible delay.

**Independent Test**: With `lastCheck` < 10 min old, `getUpdateNotice` performs no fetch (stub asserts not called). With a throwing/timeout `fetchLatest`, cache is left unchanged.

### Tests for User Story 2

- [ ] T010 [P] [US2] In `tests/unit/update-check.test.ts` — throttle: when injected clock puts `lastCheck` within `THROTTLE_MS`, `fetchLatest` is NOT called and result is `null` (C3, FR-002).
- [ ] T011 [P] [US2] In `tests/unit/update-check.test.ts` — failure semantics: when `fetchLatest` rejects/returns null, `writeCache` is NOT called (cache unchanged) and result is `null` (C6, FR-003 clarification 1).

### Implementation for User Story 2

- [ ] T012 [US2] In `getUpdateNotice`, add the throttle gate before any network: if `now() - cache.lastCheck < THROTTLE_MS` return `null` immediately (no fetch). Only write the cache after a **successful** fetch (leave it untouched on failure) (FR-002/004, R4, R5).

**Checkpoint**: Two runs within 10 min → one fetch; offline run → no error, `lastCheck` not advanced, command latency unaffected.

---

## Phase 5: User Story 3 - Quietly degrades and can be turned off (Priority: P2)

**Goal**: `--no-update-check` and non-interactive output fully disable the feature; corrupt/missing cache is tolerated.

**Independent Test**: `enabled:false` → returns `null`, no cache read/fetch. `isTTY()` false → returns `null`, no fetch. Corrupt cache → treated as no recent check, no throw.

### Tests for User Story 3

- [ ] T013 [P] [US3] In `tests/unit/update-check.test.ts` — `enabled:false` short-circuits (no cache read, no fetch) → `null` (C1); `isTTY()` false → `null`, no fetch (C2).
- [ ] T014 [P] [US3] In `tests/unit/update-check.test.ts` — corrupt/missing cache (`readCache` returns garbage/null) is treated as `lastCheck=0`, proceeds to fetch, never throws (C7).

### Implementation for User Story 3

- [ ] T015 [US3] In `getUpdateNotice`, add the suppression guards first: return `null` when `enabled === false` or `!isTTY()` (defaults to `Boolean(process.stderr.isTTY)`), before any cache/fetch work (C1, C2, FR-009/011).
- [ ] T016 [US3] In `src/index.ts`, register the global `--no-update-check` option on `program` and pass `{ enabled: program.opts().updateCheck }` to `getUpdateNotice`; skip the call entirely for `-v/--version` and help paths (FR-009, R6).

**Checkpoint**: `azdo --no-update-check ...` and piped/CI runs are silent; corrupt cache never crashes a command.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T017 [P] [POLISH] Update docs: add a short "Update notifications" note (behaviour, 10-min throttle, `--no-update-check`, non-interactive suppression) to `docs/commands.md` (and README if it documents global options).
- [ ] T018 [POLISH] Run `quickstart.md` manual validation steps 1–5 (notice / throttle / failure-safe / opt-out / non-interactive).
- [ ] T019 [POLISH] Final gate: `npm test && npm run lint` green; confirm no new runtime dependency was added to `package.json`.

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T005)** blocks everything.
- **US1 (T006–T009)** is the MVP; depends on Foundational.
- **US2 (T010–T012)** and **US3 (T013–T016)** depend on Foundational and build on the same `getUpdateNotice` body; sequence US1 → US2 → US3 because they edit the same function/files.
- **Polish (T017–T019)** last.

### Within each story

- Write the listed tests first and confirm they fail before implementing.
- `isNewer` / cache / fetch helpers (Foundational) before the orchestration body.
- Service body before entrypoint wiring.

### Parallel opportunities

- Test tasks T006/T007/T010/T011/T013/T014 all live in the same `tests/unit/update-check.test.ts` — write together but they are one file (treat `[P]` as "independent cases", not separate files).
- T017 (docs) is genuinely parallel to code once behaviour is final.
- Implementation tasks on `src/services/update-check.ts` and `src/index.ts` are **sequential** (same files) — do not parallelise.

---

## Implementation Strategy

**MVP** = Setup + Foundational + US1 (notice appears). Then layer US2 (throttle/safety) and US3 (suppression/opt-out), each independently testable, then polish. Commit after each story group with task IDs in the message.

## Notes

- No new runtime dependency (native `fetch` + `node:fs/os/path`).
- Notice → stderr only; stdout/JSON and exit codes untouched.
- All failure modes swallowed; the check is strictly best-effort.
