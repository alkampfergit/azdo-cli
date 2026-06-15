# PR Report: Auth Diagnostics

**Branch**: `030-auth-diagnostics`
**Date**: 2026-06-15
**Spec**: [specs/030-auth-diagnostics/spec.md](../030-auth-diagnostics/spec.md)

## Summary

Adds `azdo auth diagnose` — a scope-aware connectivity test that surfaces auth type, credential source, configured org, and the exact Azure DevOps API error when authentication fails. Also adds a global `--trace <filepath>` flag that appends redacted HTTP request/response entries to a local file for offline debugging of API communication failures.

## What's New

- **`src/types/auth-diagnostics.ts`**: New `AuthDiagnosticReport` and `TraceEntry` interfaces.
- **`src/services/auth-diagnostics.ts`**: `runConnectivityTest()` (scope-aware probe via `GET /_apis/projects?$top=1`), `diagnoseAuth()`, and `formatDiagnosticReport()`.
- **`src/services/trace-writer.ts`**: `TraceWriter` class with append mode, `0o600` file permissions (Unix), and credential redaction; module-level singleton.
- **`src/commands/auth.ts`**: `createAuthDiagnoseCommand()` registered as `azdo auth diagnose` subcommand with `--org`, `--project`, `--json` options.
- **`src/services/azdo-client.ts`**: `fetchRaw()` helper (returns raw status + body without throwing); `fetchWithErrors()` hooks into `TraceWriter` singleton when active.
- **`src/index.ts`**: `--trace <filepath>` global option wired to `initTraceWriter()`.

## Breaking Changes

None — `auth diagnose` and `--trace` are purely additive.

## Testing

*(To be updated after implementation)*
