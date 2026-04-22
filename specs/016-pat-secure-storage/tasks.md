---
description: "Task breakdown for 016-pat-secure-storage — Secure PAT storage and auth command"
---

# Tasks: Secure PAT Storage and `auth` Command

**Input**: Design documents in `/workspaces/azdo-cli/specs/016-pat-secure-storage/`
**Prerequisites (all approved)**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: TDD is the agreed approach for this feature — every module ships with a failing unit test BEFORE the implementation task starts. Integration tests (opt-in via `AZDO_INTEGRATION=1`) are added in the polish phase.

**Organisation**: Tasks are grouped by user story (US1/P1 = MVP, US2/P2 = browser-assist, US3/P3 = credential management) with a shared Foundational phase in the middle.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks at the same indent / in the same sub-section (different files, no dependencies on incomplete tasks).
- **[Story]**: Which user story the task belongs to (US1, US2, US3). Foundational and Polish tasks carry no story label.

## Path Conventions

Single-project layout from plan.md: all code under `src/`, all tests under `tests/`, docs under `docs/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the already-established toolchain still runs cleanly on this branch before touching code.

- [ ] T001 Verify branch toolchain: on branch `016-pat-secure-storage`, run `npm install`, then `npm test && npm run lint && npm run build`. Record baseline pass/fail in the commit message for T002 so regressions are attributable.
- [ ] T002 [P] Add `AZDO_INTEGRATION` conditional helper for integration-test skip in `tests/integration/helpers/skip-unless-integration.ts` (returns `it.skipIf(!process.env.AZDO_INTEGRATION)`). Referenced by later tasks.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared services and refactors that EVERY user story depends on. The multi-org credential keying, the org resolver, and the `resolvePat(org)` signature change ripple through every authenticated command, so this phase blocks US1–US3.

**⚠️ CRITICAL**: No user-story work starts until Phase 2 is complete and green.

### Types and contracts

- [ ] T003 [P] Add `Backend` union type, `StoredCredentialMeta` interface, and `CredentialStoreUnavailableError` class to `src/types/credential.ts` (new file). Export from the types barrel.
- [ ] T004 [P] Add `ResolveOrgOptions`, `ResolvedOrg`, `OrgSource` to `src/types/org.ts` (new file) matching `contracts/org-resolver.md`.
- [ ] T005 [P] Add `AuditEvent` interface to `src/types/audit.ts` (new file) matching `data-model.md` §AuditEvent.

### Foundational tests (TDD — write first, ensure they FAIL)

- [ ] T006 [P] Write unit tests for `org-resolver` at `tests/unit/org-resolver.test.ts`: every branch of FR-013 (flag wins, git-remote wins over config, config wins when no flag/no git, null when all absent). Use injected readers.
- [ ] T007 [P] Write unit tests for the multi-org credential store at `tests/unit/credential-store.test.ts`: set/get/delete per org, enumerate via audit-log, `CredentialStoreUnavailableError` surfacing when keyring throws, legacy single-slot migration (migrates when `config.org` set; preserves when unset).
- [ ] T008 [P] Write unit tests for `audit-log` at `tests/unit/audit-log.test.ts`: append-only, JSONL parseable, no full PAT ever present, creates `~/.azdo/` with `0700` and file with `0600` if missing. Use a tmp-dir override for the audit-log path.
- [ ] T009 [P] Extend `tests/unit/auth.test.ts`: cover `resolvePat(org)` signature — env-var precedence over stored; stored-per-org lookup keyed correctly; `null` when no env var and no stored for resolved org (no prompt).
- [ ] T010 [P] Write unit tests for `context.resolveContext` at `tests/unit/context.test.ts`: new resolution order (flag → git → config) for org; project resolution unchanged otherwise. Verify existing command behaviour is preserved when flag + config agree.

**Checkpoint**: T006–T010 MUST fail before T011 onward start.

### Foundational implementation

- [ ] T011 Implement `src/services/audit-log.ts` exporting `appendAuthAuditEvent({event, org, backend, masked_pat?})` + path helper `getAuditLogPath()`. Creates `~/.azdo/` / audit log with correct perms. Masks PAT via existing `maskedDisplay` from `auth.ts`.
- [ ] T012 Implement `src/services/org-resolver.ts` exporting `resolveOrg(opts)` and `formatResolutionError()` per `contracts/org-resolver.md`.
- [ ] T013 Refactor `src/services/credential-store.ts` to multi-org: `Entry("azdo-cli", "pat:<org>")`; export `getPat(org)`, `storePat(org, pat)`, `deletePat(org)`, `listOrgsWithStoredPat()`, `probeBackend()`. Throw `CredentialStoreUnavailableError` on keyring unavailability. Emit audit events on store/delete via T011. Implement lazy migration of the legacy single-slot (ACCOUNT=`pat`) per research §6.
- [ ] T014 Update `src/services/auth.ts`: change `resolvePat(org: string): Promise<AuthCredential | null>` — reads `AZDO_PAT` env var first (unchanged), then `getPat(org)`. When both are null, returns `null` (no prompt — FR-015). Keep `promptForPat()` intact. Add `validatePatAgainstAzdo(pat: string, org: string): Promise<boolean>` calling `GET https://dev.azure.com/<org>/_apis/projects?$top=1&api-version=7.1`.
- [ ] T015 Refactor `src/services/context.ts`: rebuild `resolveContext(opts)` to (a) call `resolveOrg()` for the org, (b) fall back to project resolution as today but after org is pinned. New resolution order for org = flag → git → config (per plan Complexity Tracking note 1). Preserve public signature so command call-sites don't need to change.
- [ ] T016 Update every command call-site to pass the resolved org into `resolvePat`: `src/commands/{list-fields,assign,upsert,pr,get-item,download-attachment,comments,set-state}.ts`. Each command now obtains `ctx = resolveContext(options)` first, then `resolvePat(ctx.org)`. If `resolvePat` returns `null`, emit FR-015 error (`azdo auth --org <name>`) and exit with code 2.
- [ ] T017 Run foundational test suite (`npm test -- tests/unit/org-resolver.test.ts tests/unit/credential-store.test.ts tests/unit/audit-log.test.ts tests/unit/auth.test.ts tests/unit/context.test.ts`) to confirm T006–T010 now pass.
- [ ] T018 `npm run lint && npm run build` green. Commit.

**Checkpoint**: Foundation ready — user-story phases can now start. No command should currently be broken (all existing unit tests for commands continue to pass because the `resolveContext` signature is unchanged; only behaviour on certain combinations of flag / git / config changes, and those new behaviours are covered by T010).

---

## Phase 3: User Story 1 — First-time interactive setup (Priority: P1) 🎯 MVP

**Goal**: User runs `azdo auth` with a resolved org, pastes a PAT, it's validated against Azure DevOps, and stored in the OS vault. Subsequent commands authenticate successfully without re-prompting.

**Independent Test**: On a clean host (no `AZDO_PAT` env var, no legacy or per-org slot), run `azdo auth --org <name>`, paste a valid PAT. Exit `0`. Then run any authenticated command (e.g. `azdo work-item get <id> --org <name>`) — it authenticates successfully.

### Tests for User Story 1 (TDD)

- [ ] T019 [P] [US1] Write unit tests for the `auth` command at `tests/unit/auth-command.test.ts`: happy-path store (mocked validator OK), validation-failure path (mocked validator returns 401 → exit 2, nothing stored, audit `auth.validate.fail`), org-resolution failure path (exit 3), stdin-piped PAT (FR-011), overwrite-confirm on existing credential, `--no-browser` respected.
- [ ] T020 [P] [US1] Write unit test for `validatePatAgainstAzdo` at `tests/unit/validate-pat.test.ts`: constructs correct URL, Basic-auth header with `:<pat>` base64, returns `true` on 200, `false` on 401/403, throws on other statuses. Use `fetch` mock.

**Checkpoint**: T019–T020 fail before T021 starts.

### Implementation for User Story 1

- [ ] T021 [US1] Implement `src/commands/auth.ts` with the root `auth` command action: resolve org → read PAT (stdin if `--from-stdin`, else interactive via existing `promptForPat()`) → `validatePatAgainstAzdo` → overwrite-confirm if existing → `storePat(org, pat)` → print confirmation to stdout. No browser logic yet (stub `--browser` to no-op; US2 fills it). Register via `src/cli.ts`.
- [ ] T022 [US1] Wire exit codes per `contracts/auth-command.md`: 0, 1, 2, 3, 4. Ensure `CredentialStoreUnavailableError` from the store surfaces as exit 4 with a single-line diagnostic identifying the missing backend.
- [ ] T023 [US1] Update `src/commands/clear-pat.ts` to take `--org` (optional; resolves via `resolveOrg()`), call new `deletePat(org)`, and emit deprecation notice to stderr: `` `azdo clear-pat` is deprecated; use `azdo auth logout [--org <name>]` instead. ``
- [ ] T024 [US1] Run US1 tests (`npm test -- tests/unit/auth-command.test.ts tests/unit/validate-pat.test.ts`) and full suite. Lint. Commit.

**Checkpoint**: US1 delivers the MVP. A user can now auth an org and every existing command works for that org.

---

## Phase 4: User Story 2 — Browser-assisted PAT creation (Priority: P2)

**Goal**: `azdo auth` (without `--no-browser`) opens the Azure DevOps PAT-creation page in the user's default browser. On headless systems, print the URL.

**Independent Test**: On a graphical host, run `azdo auth --org <name>`. Browser opens to `https://dev.azure.com/<name>/_usersSettings/tokens`. On a headless host (no `$DISPLAY`), the URL is printed to stderr and the prompt proceeds.

### Tests for User Story 2 (TDD)

- [ ] T025 [P] [US2] Write unit tests for `browser-open` at `tests/unit/browser-open.test.ts`: per-platform command selection (`open` on darwin, `start` on win32, `xdg-open` on linux), headless detection (`!process.stdout.isTTY || !process.env.DISPLAY` on linux), graceful fallback to URL-print when the opener spawn fails. Mock `node:child_process.execFile`.
- [ ] T026 [P] [US2] Extend `auth-command.test.ts` (or add `auth-command-browser.test.ts`) with: `--browser` triggers `openUrl`; `--no-browser` skips; URL contains the resolved org.

**Checkpoint**: T025–T026 fail before T027 starts.

### Implementation for User Story 2

- [ ] T027 [US2] Implement `src/services/browser-open.ts` exporting `openUrl(url: string, opts?: { headless?: boolean }): Promise<'opened' | 'printed'>`. Uses `child_process.execFile` (never `exec`, to avoid shell injection). Chooses `open` / `start` / `xdg-open` by platform; returns `'printed'` when forced or when spawn fails.
- [ ] T028 [US2] Integrate `browser-open` into `src/commands/auth.ts`: before prompting, compute URL `https://dev.azure.com/${org}/_usersSettings/tokens`, call `openUrl`. On `'printed'`, write URL to stderr. Suppress entirely when `--from-stdin` or `--no-browser`.
- [ ] T029 [US2] Run US2 tests and full suite. Lint. Commit.

**Checkpoint**: US1 + US2 both work. First-time users get browser-assist; scripted users (`--from-stdin` / `--no-browser`) are unaffected.

---

## Phase 5: User Story 3 — Credential management subcommands (Priority: P3)

**Goal**: `azdo auth status [--json]` reports stored credentials (masked, never full PAT). `azdo auth logout [--org X | --all]` removes them. Existing `clear-pat` stays as deprecated alias.

**Independent Test**: After US1 stored a PAT for org X, `azdo auth status --org X --json` emits a JSON object with `stored: true` and masked identifier but NEVER the full PAT. `azdo auth logout --org X` removes it; a subsequent `azdo auth status --org X` exits `1` with `stored: false`.

### Tests for User Story 3 (TDD)

- [ ] T030 [P] [US3] Write unit tests for `auth status` at `tests/unit/auth-status.test.ts`: present → exit 0 with masked identifier; absent → exit 1; `--json` branch; reads updated-at from audit log; never prints the full PAT (assert via output scan).
- [ ] T031 [P] [US3] Write unit tests for `auth logout` at `tests/unit/auth-logout.test.ts`: single-org removal (existing, missing); `--all` (removes every `pat:*` slot, emits one line per removed org); `--org` and `--all` are mutually exclusive (commander conflict); audit event on each removal.

**Checkpoint**: T030–T031 fail before T032 starts.

### Implementation for User Story 3

- [ ] T032 [US3] Implement `auth status` subcommand in `src/commands/auth.ts`: resolve org → probe backend → `getPat(org)` → compose output (human or JSON). Mask via existing `maskedDisplay`. Read latest `auth.store` event for org from audit log to compute `updated_at`.
- [ ] T033 [US3] Implement `auth logout` subcommand in `src/commands/auth.ts`: either `deletePat(org)` or iterate `listOrgsWithStoredPat()` and delete each. Commander enforces `--org` / `--all` mutual exclusion.
- [ ] T034 [US3] Run US3 tests and full suite. Lint. Commit.

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, README, full-suite validation, opt-in integration tests, final lint/build.

- [ ] T035 [P] Rewrite `docs/authentication.md` for the multi-org flow (env var, `azdo auth`, `auth status`, `auth logout`, `--org`, git-remote auto-detect, `config set org`, env-var precedence, secret-store failure mode). Include the quickstart walkthrough.
- [ ] T036 [P] Update top-level `README.md`: update the "Store PAT in OS credential store (or use `AZDO_PAT`)" line to reflect multi-org; link to the rewritten `docs/authentication.md`; update the `clear-pat` row if a commands table is present to note the `auth logout` successor. Per constitution §Development Workflow, README MUST be reviewed and updated before merge.
- [ ] T037 [P] Write integration test `tests/integration/auth.integration.test.ts` guarded by `AZDO_INTEGRATION=1` using T002's helper. Round-trip: store → status → logout on the host's real keyring. Does NOT hit Azure DevOps (that requires a real PAT — covered in manual verification via quickstart.md).
- [ ] T038 Run the quickstart walkthrough from `quickstart.md` end-to-end on the developer's host machine. Record the output in the PR body.
- [ ] T039 `npm test && npm run lint && npm run build` green on branch tip. Commit any final touches.
- [ ] T040 Verify `audit.log` location is listed in `.gitignore` (it's user-home, so it shouldn't appear — but double-check in case anyone has `~/.azdo` symlinked into the repo).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** — no deps.
- **Foundational (Phase 2)** — depends on Setup. **BLOCKS all user stories.**
- **User Stories (Phases 3–5)** — all depend on Foundational. US1 is the MVP and should be delivered first; US2 and US3 can be delivered in either order after US1.
- **Polish (Phase 6)** — depends on all three user stories being complete.

### User Story Dependencies

- **US1 (P1)** — depends on Foundational only; does NOT depend on US2 or US3.
- **US2 (P2)** — modifies `src/commands/auth.ts` (same file as US1's T021). Sequential after US1 for that file; otherwise independent.
- **US3 (P3)** — adds subcommands in `src/commands/auth.ts` (same file as US1+US2). Sequential after US2 for that file; otherwise independent.

### Within Each Story

- Tests (T019–T020, T025–T026, T030–T031) MUST fail before the corresponding implementation task starts.
- Models/types (Phase 2) before services.
- Services before commands.
- Each story commits in a single logical group (one commit per checkpoint).

### Parallel Opportunities

- Phase 2 types (T003–T005) all [P].
- Phase 2 foundational tests (T006–T010) all [P] — different files.
- Phase 3 tests (T019–T020) [P].
- Phase 4 tests (T025–T026) [P].
- Phase 5 tests (T030–T031) [P].
- Polish docs (T035–T037) [P] — different files.

---

## Parallel Example: Phase 2 Foundational Tests

```bash
# Launch all foundational tests together (they'll all fail at first):
Task: "Write unit tests for org-resolver at tests/unit/org-resolver.test.ts"
Task: "Write unit tests for credential-store at tests/unit/credential-store.test.ts"
Task: "Write unit tests for audit-log at tests/unit/audit-log.test.ts"
Task: "Extend tests/unit/auth.test.ts for resolvePat(org)"
Task: "Write unit tests for context.resolveContext at tests/unit/context.test.ts"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1: Setup (T001–T002)
2. Phase 2: Foundational (T003–T018) — multi-org keying + org resolver + migration is the bulk of the work
3. Phase 3: User Story 1 (T019–T024) — the `azdo auth` command itself
4. **STOP and validate**: full walkthrough of User Story 1 on Linux/macOS/Windows if available; at minimum on the dev host.
5. Optionally ship the MVP.

### Incremental Delivery

1. MVP (US1) → validate → (optional early demo).
2. Add US2 → browser-assist → test independently (headless falls back correctly).
3. Add US3 → management subcommands + deprecation alias → test.
4. Polish phase finalises docs + integration tests.

### TDD Cadence

For every Phase 2/3/4/5 implementation task:

1. The corresponding test task's tests MUST fail on a clean checkout before impl starts.
2. Run `npm test -- <file>` for the specific test file as the implementation progresses.
3. At checkpoint, the full `npm test` suite stays green.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- [Story] label maps tasks to user stories for traceability.
- Every user story must remain independently completable and testable (the shared `src/commands/auth.ts` is the one coupling point — handle sequentially for that file, in parallel for other files).
- Never commit anything that would write a full PAT to a tool-managed file (SC-002).
- Per constitution §Development Workflow, `README.md` is reviewed and updated before merge (T036 enforces this).
- Full-suite gate per AGENTS.md: `npm test && npm run lint` on every commit that touches code.
- No `@copilot` or any action-triggering bot mention in commits, PR body, or comments.
