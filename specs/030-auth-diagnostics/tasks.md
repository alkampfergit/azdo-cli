# Tasks: Auth Diagnostics

**Input**: Design documents from `/specs/030-auth-diagnostics/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: New type and service files needed by both user stories

- [ ] T001 Create `src/types/auth-diagnostics.ts` with `AuthDiagnosticReport` and `TraceEntry` interfaces per data-model.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure required by both user stories before implementation begins

- [ ] T002 Create `src/services/trace-writer.ts` with `TraceWriter` class (append to file, `0o600` mode on Unix), module-level singleton `initTraceWriter(path)` / `getActiveTraceWriter()`, and `redactHeaders()`/`redactBody()` redaction helpers per contracts/trace-flag-cli.md
- [ ] T003 Add `fetchRaw(url, init)` helper to `src/services/azdo-client.ts` that calls native `fetch` and returns `{ status, body }` without throwing — used by diagnose connectivity test to surface raw ADO error messages

**Checkpoint**: TraceWriter singleton and raw-fetch helper ready — user story work can now begin

---

## Phase 3: User Story 1 — Auth Diagnose Command (Priority: P1) 🎯 MVP

**Goal**: `azdo auth diagnose` prints auth type, credential source, org, and scope-aware connectivity result with exact API error on failure

**Independent Test**: `azdo auth diagnose --org <org>` with a valid PAT prints "Connectivity: OK"; with an invalid PAT prints "Connectivity: FAILED" and the exact ADO error message; with no credentials prints "Auth type: none"

- [ ] T004 [US1] Create `src/services/auth-diagnostics.ts` with `runConnectivityTest(org, cred)` that calls `GET https://dev.azure.com/{org}/_apis/projects?api-version=7.1&$top=1` via `fetchRaw()` and returns `{ status: 'ok' | 'failed', error: string | null }` per research.md §2
- [ ] T005 [US1] Add `diagnoseAuth(org, project?)` function to `src/services/auth-diagnostics.ts` that calls `resolveAuthCredential(org)`, maps `{ kind, source }` to `AuthDiagnosticReport` fields, calls `runConnectivityTest()`, and returns the complete `AuthDiagnosticReport`
- [ ] T006 [US1] Add `formatDiagnosticReport(report, json)` to `src/services/auth-diagnostics.ts` that renders human-readable output (per contracts/auth-diagnose-cli.md §Output) or JSON (`--json` flag)
- [ ] T007 [US1] Add `createAuthDiagnoseCommand()` to `src/commands/auth.ts` that accepts `--org`, `--project`, `--json` options, calls `diagnoseAuth()`, writes formatted output to stdout, exits non-zero when `connectivityStatus === 'failed'`
- [ ] T008 [US1] Register `createAuthDiagnoseCommand()` as a subcommand of `createAuthCommand()` in `src/commands/auth.ts`
- [ ] T009 [US1] Add unit tests in `tests/unit/auth-diagnostics.test.ts` covering: OK connectivity, FAILED connectivity with error text, no-credentials path, JSON output format, and `formatDiagnosticReport` human-readable layout

---

## Phase 4: User Story 2 — HTTP Request/Response Trace Log (Priority: P2)

**Goal**: `--trace <filepath>` global flag appends redacted HTTP entries to a file for any `azdo` command

**Independent Test**: `azdo --trace /tmp/t.log get-item 1` creates the log file; inspecting it shows request/response entries with `[REDACTED]` in place of the Authorization header value; running a second time appends rather than overwrites

- [ ] T010 [US2] Modify `fetchWithErrors(url, init)` in `src/services/azdo-client.ts` to call `getActiveTraceWriter()` and, when non-null, append a `TraceEntry` (with redacted headers/body) after every response — both successful and error responses
- [ ] T011 [US2] Register `--trace <filepath>` option on the root `program` command in `src/index.ts`; after `program.parseOptions()` / before `program.parseAsync()`, call `initTraceWriter(opts.trace)` when the flag is present
- [ ] T012 [US2] Add unit tests in `tests/unit/trace-writer.test.ts` covering: file creation with `0o600` mode (skipped on Windows), append behaviour across multiple writes, `[REDACTED]` substitution in Authorization header, redaction of `token`/`accessToken`/`pat` JSON body fields, non-writable path is non-fatal (warning to stderr)

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, README update, final validation

- [ ] T013 [P] Update `README.md` to document `azdo auth diagnose` usage and the global `--trace` flag with examples from quickstart.md
- [ ] T014 [P] Update `docs/commands.md` (if present) with `azdo auth diagnose` command reference entry
- [ ] T015 Run full build (`npm run build`) and test suite (`npm test`) and fix any TypeScript errors or test failures

---

## Dependencies

```
T001 (types)
  └─ T002 (TraceWriter) ──────────────────────── T010, T011, T012
  └─ T003 (fetchRaw) ──── T004, T005 ─── T006 ─── T007 ─── T008, T009
```

US1 (T004–T009) and US2 (T010–T012) can proceed in parallel after Phase 2 completes.

## Implementation Strategy

**MVP** (Phase 1–3 only): Ship `azdo auth diagnose` first — solves the user's immediate debugging problem with no risk to existing commands.

**Full delivery** (Phase 4): Add `--trace` — invasive change to `fetchWithErrors` and `src/index.ts`; best done after US1 is proven stable.
