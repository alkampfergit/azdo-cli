# Tasks: Multi-Organization Support

**Input**: Design documents from `specs/025-multi-org-support/`
**Branch**: `025-multi-org-support`
**Gate commands**: `npm run test:unit && npm run test:integration && npm run lint && npm run build`

---

## Phase 1: Foundational — Config Schema Extension

**Purpose**: Shared data-model and scope-resolution function that US1 and US2 both require.
**Blocks**: US1 (phases 2) and US2 (phase 3). US3/US4/US5 are independent and may proceed in parallel with this phase.

- [ ] T001 [US1] Add `ScopedSettings` and extend `CliConfig` in `src/services/config-store.ts`: `ScopedSettings { project?, fields?, markdown? }`; `CliConfig extends ScopedSettings` adds `org?` (top-level only) and `organizations?: Record<string, ScopedSettings>` (per data-model.md)
- [ ] T002 [US1] Implement `resolveScopedConfig(org?: string): ScopedSettings & { org?: string }` in `src/services/config-store.ts` — per-key precedence: `organizations[lc(org)]?.[key] ?? topLevel[key]`; case-insensitive org key lookup
- [ ] T003 [US1] Update `readConfig()` / `writeConfig()` in `src/services/config-store.ts` to round-trip the `organizations` map transparently; normalise org keys to lower-case on write; remove org scopes that have zero keys on save (no empty objects persisted)

**Checkpoint**: Config schema + scope resolution ready — US1 and US2 can begin.

---

## Phase 2: US1 — Per-Organization Configuration (Priority: P1) 🎯 MVP

**Goal**: Users can keep a default config and add org-scoped overrides; `config list` shows scope; `org-copy/move/delete` manage scopes.

**Independent Test**: Set a default `fields` config and an org-scoped `fields` for org `acme`; run `config list` to confirm scope column; verify `org-move acme globex` removes `acme` scope and creates `globex` scope; verify `org-delete globex` restores default fallback.

### Tests for US1 — write first, ensure FAIL before T007–T011

- [ ] T004 [P][US1] Extend `tests/unit/config-store.test.ts`: scope resolution cases (org override beats default; unknown-org falls back to default; case-insensitive org key; pre-feature config file without `organizations` key reads cleanly; empty org scope removed on save)
- [ ] T005 [P][US1] Extend `tests/unit/config-commands.test.ts`: `config set/get/unset --org <name>` routes to org scope; missing `--org` uses default scope (existing behaviour unchanged)
- [ ] T006 [P][US1] Create `tests/integration/config-org.test.ts`: end-to-end CLI tests for `config list` scope column (table and `--json`); `org-copy default acme` produces independent copy; `org-move acme globex`; `org-delete globex`; `--force` flag on collision

### Implementation

- [ ] T007 [US1] Add `setOrgScopedValue(org, key, value)`, `unsetOrgScopedValue(org, key)`, `getOrgScopedValue(org?, key)` to `src/services/config-store.ts`; reject `org` as a key inside a scope (data-model invariant)
- [ ] T008 [US1] Add `copyOrgScope(from, to, force?)`, `moveOrgScope(from, to, force?)`, `deleteOrgScope(name)` to `src/services/config-store.ts`; `from` may be `"default"` (copies default-scope `project/fields/markdown`); fail with clear message on key collision unless `--force`; `deleteOrgScope` is idempotent
- [ ] T009 [US1] Extend `config set`, `config get`, `config unset` in `src/commands/config.ts`: add `--org <name>` option; route to `setOrgScopedValue` / `getOrgScopedValue` / `unsetOrgScopedValue` when `--org` present
- [ ] T010 [US1] Add `config org-copy <from> <to> [--force]`, `config org-move <from> <to> [--force]`, `config org-delete <name>` subcommands to `src/commands/config.ts`
- [ ] T011 [US1] Update `config list` in `src/commands/config.ts`: add `scope` column (value: `default` or the org name) in table output; include all org-scoped entries; add `scope` field in `--json` output

**Checkpoint**: US1 fully functional. `npm run test:unit` and `tests/integration/config-org.test.ts` green.

---

## Phase 3: US2 — Missing Custom Fields Degrade to Warning (Priority: P2)

**Goal**: `get-item` succeeds even when configured fields don't exist in the target org; missing fields are warned on stderr; no change for orgs where all fields exist.

**Independent Test**: Configure a custom field absent in the target org; run `get-item`; verify work-item output renders all available fields + one stderr warning per missing field; exit code 0.

### Tests for US2 — write first, ensure FAIL before T013–T015

- [ ] T012 [P][US2] Extend `tests/unit/azdo-client.test.ts`: mock 400+TF51535 → field-list fetch → retry with reduced field set; fields-all-exist path makes no extra fetch; second 400 on retry propagates as error; warnings are emitted on `stderr` not `stdout`

### Implementation

- [ ] T013 [US2] Add `getOrgFieldNames(org: string, project: string): Promise<string[]>` to `src/services/azdo-client.ts` (calls `GET /{org}/{project}/_apis/wit/fields?api-version=7.0`); returns reference names
- [ ] T014 [US2] Wrap `getWorkItem()` in `src/services/azdo-client.ts`: on HTTP 400 response body containing `TF51535`, call `getOrgFieldNames`, partition requested extra fields into `existing`/`missing` (as `FieldValidationResult`), emit `console.error` warning per missing field, retry once with `existing` only; a second 400 is a real error and propagates unchanged
- [ ] T015 [US2] Update `src/commands/get-item.ts`: replace direct `config.fields` / `config.markdown` reads with `resolveScopedConfig(context.org)` calls after context resolution so org-scoped field lists are used automatically

**Checkpoint**: US2 independently testable. `npm run test:unit` (azdo-client tests) green.

---

## Phase 4: US3 + US4 — Remote Discovery & Git Stderr Suppression (Priority: P2 / P3)

**Goal**: Auto-detect org/project from any Azure DevOps remote, not only `origin`; git's own stderr never reaches the console.

**Independent Test (US3)**: In a repo where `origin` is GitHub and `azdo` is Azure DevOps, run `get-item` without `--org/--project` and verify org/project are detected from `azdo`. **Independent Test (US4)**: Run any command from a non-git directory with default org configured; verify no `fatal:` lines in output.

### Tests for US3+US4 — write first, ensure FAIL before T017–T020

- [ ] T016 [P][US3][US4] Extend `tests/unit/git-remote.test.ts`: single non-`origin` AZDO remote is selected; `origin` wins when multiple AZDO remotes present; ambiguity error lists `remoteName → org/project` pairs when ≥2 distinct org/project and no `origin`; no-candidates path; git `fatal:` text never surfaces on stderr in any path

### Implementation

- [ ] T017 [US3][US4] Rework remote enumeration in `src/services/git-remote.ts`: call `git remote -v` via `execSync` with `{ stdio: ['pipe', 'pipe', 'pipe'] }` (stderr fully suppressed); parse all output lines into `RemoteCandidate[]` (per `data-model.md`: `remoteName`, `org`, `project`, `hasEmbeddedSecret`)
- [ ] T018 [US3] Implement `selectRemote(candidates: RemoteCandidate[]): RemoteCandidate` in `src/services/git-remote.ts` with the four-case logic from data-model.md: (1) `origin` among candidates → select `origin`; (2) all candidates share same org+project → select first; (3) ≥2 distinct org/project, no `origin` → throw ambiguity error listing `remoteName → org/project`; (4) no candidates → existing "provide `--org` and `--project`" error
- [ ] T019 [US3] Update `src/services/context.ts` to call `selectRemote()` and pass detected `org` to `resolveScopedConfig()` throughout so per-org config is applied automatically
- [ ] T020 [US3] Update `src/services/org-resolver.ts`: replace hardcoded `"origin"` text in error messages with the actual `remoteName` from the selected `RemoteCandidate`

**Checkpoint**: US3+US4 independently testable. `npm run test:unit` (git-remote, context, org-resolver) green.

---

## Phase 5: US5 — Embedded-Credentials Warning (Priority: P3)

**Goal**: Warning fires only for `user:secret@` URLs (not bare `user@`); names the actual remote used.

**Independent Test**: Parse three remote URLs — `https://user:token@dev.azure.com/…`, `https://user@dev.azure.com/…`, `https://dev.azure.com/…` — and verify only the first triggers the warning, and the warning names the correct `remoteName`.

### Tests for US5 — write first, ensure FAIL before T022

- [ ] T021 [P][US5] Extend `tests/unit/remote-warning.test.ts`: `user:secret@` fires warning once with correct `remoteName`; bare `user@` (Azure DevOps default clone format) is silent; clean URL is silent; warning goes to stderr; fires at most once per process

### Implementation

- [ ] T022 [US5] Update `src/services/remote-warning.ts`: change trigger from any userinfo to `hasEmbeddedSecret` (URL userinfo contains `:`); accept `remoteName` from the selected `RemoteCandidate` and include it in the warning message instead of hardcoding `"origin"`

**Checkpoint**: US5 independently testable. `npm run test:unit` (remote-warning) green.

---

## Phase 6: Polish & Validation

- [ ] T023 [P] Update `docs/commands.md`: document the new `config` CLI surface (`--org <name>` on `set/get/unset`; `org-copy`, `org-move`, `org-delete` subcommands; scope column in `list` output)
- [ ] T024 Run the `specs/025-multi-org-support/quickstart.md` walkthrough manually to confirm the end-to-end multi-org workflow behaves as documented
- [ ] T025 Run the full gate: `npm run test:unit && npm run test:integration && npm run lint && npm run build`

---

## Dependencies & Execution Order

| Phase | Depends on | Can parallelise with |
|-------|-----------|----------------------|
| Phase 1 (Foundational) | — | Phase 4 tests (T016), Phase 5 tests (T021) |
| Phase 2 (US1) | Phase 1 complete | Phase 3 (after Phase 1), Phase 4, Phase 5 |
| Phase 3 (US2) | Phase 1 complete (T002 needed for T015) | Phase 2, Phase 4, Phase 5 |
| Phase 4 (US3+US4) | Independent | All other phases |
| Phase 5 (US5) | Independent (integrates with Phase 4 via `remoteName`) | All other phases |
| Phase 6 (Polish) | All phases complete | — |

### TDD Execution Order Within Each Phase

1. Write test tasks (T004–T006, T012, T016, T021) and confirm they **FAIL** — no implementation exists yet.
2. Implement the corresponding production tasks.
3. Confirm tests pass before moving to the next phase.
4. Commit after each task or logical group using scope `#55`.

### Parallel Opportunities

- T004, T005, T006 (US1 tests) can be written in parallel.
- T016 (US3/US4 tests) and T021 (US5 tests) can be written while Phase 1 implementation is in progress.
- Phase 2, Phase 3, Phase 4, and Phase 5 implementations can proceed in parallel once their respective foundational prerequisites are met.
