# Implementation Plan: Check for new stable version on startup

**Branch**: `022-version-update-check` | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/022-version-update-check/spec.md`

## Summary

Add a lightweight, throttled, non-blocking npm update check to the `azdo` CLI. On command execution the tool reads a small cache file; if the last *successful* check is older than 10 minutes it performs one quick request to the npm registry for the latest **stable** version of `azdo-cli`, and — if that is newer than the running version — prints a single-line upgrade notice to stderr after the command's own output. The check never blocks or errors the user's command, is suppressed in non-interactive output, and can be disabled with `--no-update-check`.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode) on Node.js LTS (18+)
**Primary Dependencies**: commander.js (existing), native `fetch` (built-in), `node:fs` / `node:path` / `node:os` (built-in) — **no new runtime dependency**
**Storage**: JSON cache file at `~/.azdo/update-check.json` (reuses the existing `~/.azdo/` directory used by `config-store.ts`)
**Testing**: vitest (`npm test` builds then runs unit + integration)
**Target Platform**: cross-platform CLI (Linux/macOS/Windows)
**Project Type**: single-project CLI
**Performance Goals**: cached path (the common case) does zero network I/O and only one small synchronous file read (negligible); a fresh registry check happens at most once per 10 minutes and is bounded by a short abort timeout
**Constraints**: must never block/slow the invoked command, never surface an error from the check, suppress in non-interactive output, throttle to ≤1 registry lookup / 10 min
**Scale/Scope**: one new service module + one global option + entrypoint wiring + tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. CLI-First Design** ✅ — exposes a global `--no-update-check` option; notice goes to **stderr** so stdout/JSON output is untouched; never changes exit codes.
- **II. TypeScript Strictness** ✅ — strict types, no `any`; cache parsing uses `unknown` + a type guard.
- **III. Single Responsibility** ✅ — all logic lives in a new `src/services/update-check.ts`; the entrypoint only wires it.
- **IV. npm Distribution** ✅ — no new runtime dependency; native `fetch` + built-ins only; nothing added to the bundle beyond the new module.
- **Testing** ✅ — unit tests for throttle/compare/suppression logic with injected clock, fs, fetch, and TTY; no real network in unit tests.

No violations → Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/022-version-update-check/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── update-check.md  # Phase 1 output — module contract
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── index.ts                      # MODIFIED: register --no-update-check; run notice after the command
├── services/
│   ├── config-store.ts           # (existing) — source of the ~/.azdo dir convention
│   └── update-check.ts           # NEW: cache I/O, throttle, registry fetch, version compare, notice
└── version.ts                    # (existing) — running version

tests/
└── unit/
    └── update-check.test.ts      # NEW: throttle, compare, suppression, failure-safety
```

**Structure Decision**: Single-project CLI (matches the repo). One new service module holds all behaviour; `src/index.ts` is the only existing file modified. The cache lives under `~/.azdo/` (the directory already created/used by `config-store.ts`), keeping all CLI state in one place.

## Key design decisions (detail in research.md)

1. **Registry query**: `GET https://registry.npmjs.org/azdo-cli/latest` — the `latest` dist-tag is the stable release by definition (excludes pre-releases), and the per-version endpoint returns a small manifest (fastest option). Parse `.version`. Native `fetch` with an `AbortController` timeout (~1500 ms).
2. **Throttle & failure semantics**: read `~/.azdo/update-check.json`; if `lastCheck` is < 10 min ago, do nothing (no network). Only a **successful** fetch rewrites `lastCheck` — a failed/timed-out check leaves the file unchanged so the next invocation may retry (per clarification 1).
3. **Notice cadence**: the single-line notice is emitted **only on the invocation that performs a fresh successful check** and finds a newer stable version. Cached-window invocations print nothing → "once per 10-minute window" with no per-command spam (clarification 3).
4. **Non-blocking**: the check is gated on the throttle first (so the overwhelmingly common path is one sync file read). When a check is due it runs via a `postAction` hook (switching `program.parse()` → `await program.parseAsync()`), bounded by the abort timeout, and prints **after** the command output.
5. **Suppression**: skip entirely when `--no-update-check` is set (clarification 4) or when stderr is non-interactive (`!process.stderr.isTTY`) (clarification 2). Also skip for `-v/--version` and `help`.
6. **Safety**: every step is wrapped so any error (network, parse, fs) is swallowed — the user's command and exit code are never affected (FR-007/FR-008). Dev/local builds (running version ≥ latest) produce no notice (FR-010).

## Complexity Tracking

*No constitution violations — not applicable.*
