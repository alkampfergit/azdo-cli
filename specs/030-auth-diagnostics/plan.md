# Implementation Plan: Auth Diagnostics

**Branch**: `030-auth-diagnostics` | **Date**: 2026-06-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/030-auth-diagnostics/spec.md`

## Summary

Add `azdo auth diagnose` — a scope-aware connectivity test that surfaces auth type, credential source, org, and the exact ADO API error — plus a global `--trace <filepath>` flag that appends redacted HTTP request/response entries to a file for offline debugging.

## Technical Context

**Language/Version**: TypeScript 5.x (strict)
**Primary Dependencies**: commander.js, native `fetch`, Node.js `fs` (file permissions)
**Storage**: Append-only local file (trace log); no new persistent state
**Testing**: vitest
**Target Platform**: Node.js LTS (cross-platform; file permission restriction is Unix/macOS only)
**Project Type**: CLI tool
**Performance Goals**: `auth diagnose` completes in under 5 seconds (SC-002)
**Constraints**: Zero new runtime dependencies; cross-platform
**Scale/Scope**: Single-user CLI; trace file grows per-invocation

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. CLI-First Design | ✅ | `azdo auth diagnose` is a proper subcommand; `--trace` is a POSIX-style flag; errors to stderr |
| II. TypeScript Strictness | ✅ | No `any`; `AuthDiagnosticReport` and `TraceEntry` interfaces fully typed |
| III. Single Responsibility | ✅ | Diagnose logic in `auth-diagnostics.ts`; trace logic in `trace-writer.ts` |
| IV. npm Distribution | ✅ | No new runtime deps; bundled via tsup |
| V. Simplicity | ✅ | Thin wrappers; no new abstractions beyond what FR requires |
| VI. ADO API Research | ✅ | Connectivity test uses `GET /_apis/projects?$top=1&api-version=7.1` (scope-aware, read-only) |

No gate violations.

## Project Structure

### Documentation (this feature)

```text
specs/030-auth-diagnostics/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── auth-diagnose-cli.md
│   └── trace-flag-cli.md
└── tasks.md             # Phase 2 output (speckit-tasks)
```

### Source Code Changes

```text
src/
├── commands/
│   └── auth.ts                   # ADD createAuthDiagnoseCommand(); register as subcommand
├── services/
│   ├── auth.ts                   # ADD diagnoseAuth() — calls resolveAuthCredential + connectivity test
│   ├── auth-diagnostics.ts       # NEW — runConnectivityTest(), formatDiagnosticReport()
│   ├── azdo-client.ts            # MODIFY fetchWithErrors() — accept optional TraceWriter param
│   └── trace-writer.ts           # NEW — TraceWriter class, singleton, redaction logic
├── types/
│   └── auth-diagnostics.ts       # NEW — AuthDiagnosticReport, TraceEntry interfaces
└── index.ts                      # ADD --trace global option; init TraceWriter singleton

tests/unit/
├── auth-diagnostics.test.ts      # NEW — unit tests for diagnoseAuth, connectivity, formatting
└── trace-writer.test.ts          # NEW — unit tests for redaction, file creation, append
```

**Structure Decision**: Single-project flat layout, consistent with all existing features.

## Implementation Notes

### `azdo auth diagnose` flow

1. Resolve org via normal context resolution (`resolveContext`)
2. Call `resolveAuthCredential(org)` — returns `{ kind, source, pat }` or `null`
3. If `null`: print "Auth type: none / Source: (none) / Connectivity: no credentials found"; exit 0
4. POST to `GET https://dev.azure.com/{org}/_apis/projects?api-version=7.1&$top=1` with resolved credential
5. On success (2xx): print `Connectivity: OK`
6. On failure: catch the raw HTTP response (bypass `fetchWithErrors` error mapping to get real message), print `Connectivity: FAILED\nError: <body.message>`
7. Exit 0 on OK, 1 on FAILED

### Connectivity test — raw error surfacing

`fetchWithErrors` currently maps 401 → `AUTH_FAILED` etc., discarding the body. The diagnose command needs the raw ADO error message. Solution: add a thin `fetchRaw()` (or call native `fetch` directly in `auth-diagnostics.ts`) that returns the status + body without throwing, used only for the connectivity probe.

### `--trace` wiring

- `src/index.ts`: `program.option('--trace <filepath>', 'append HTTP request/response log to file')` before `program.parse()`
- After parse: `const tracePath = program.opts().trace; if (tracePath) initTraceWriter(tracePath);`
- `initTraceWriter` opens the file (`fs.open`, mode `0o600`), sets the module-level `TraceWriter` singleton
- `fetchWithErrors` checks `getActiveTraceWriter()` and appends an entry after each response

### Redaction in TraceWriter

- Authorization header → `[REDACTED]`
- Headers matching `/^x-.*token$/i` → `[REDACTED]`
- URL query params `token`, `pat` → `[REDACTED]`
- JSON body top-level `token`, `accessToken`, `pat` fields → `[REDACTED]` (best-effort; non-JSON bodies untouched)

### File permissions (FR-008)

```typescript
// Unix only — Windows ignores the mode argument
fs.open(filepath, 'a', 0o600, (err, fd) => { ... })
```

Document in help text that trace files are created owner-only on Unix/macOS; Windows users should restrict access via NTFS ACLs if needed.

## ADO API — Connectivity Test Endpoint

`GET https://dev.azure.com/{org}/_apis/projects?api-version=7.1&$top=1`

- **Auth required**: Yes (401 for invalid credentials)
- **Scope required**: Project and Team (read) — validates PAT scope
- **Response on success**: `{ count: N, value: [...] }` (200)
- **Response on auth failure**: `{ message: "TF400813: ..." }` (401/403)
- **Side effects**: None (read-only)
