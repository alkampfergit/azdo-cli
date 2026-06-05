# Implementation Plan: Multi-Organization Support

**Branch**: `025-multi-org-support` | **Date**: 2026-06-05 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/025-multi-org-support/spec.md`

## Summary

Make the CLI fully usable across multiple Azure DevOps organizations: (1) per-organization configuration scopes layered over the existing global config file, with list/copy/move/delete management; (2) graceful degradation when configured custom fields don't exist in the target org (warn + render instead of TF51535 hard failure); (3) org/project auto-detection from **any** git remote, not just `origin`; (4) suppression of git's own stderr noise; (5) credentials warning narrowed to genuinely secret-bearing URLs (`user:token@`) and naming the remote actually used.

Technical approach: extend `~/.azdo/config.json` with an optional `organizations` map (backward compatible — top-level keys remain the default scope); add an org-aware config resolution function used by all commands that read `fields`/`markdown`/`project`; rework `detectAzdoContext()` to enumerate all remotes with git stderr suppressed; on TF51535 fall back to validating configured fields against the org's field list and retry once without the missing ones.

## Technical Context

**Language/Version**: TypeScript 5.x (`strict: true`) on Node.js LTS (18+)
**Primary Dependencies**: commander.js (CLI), native `fetch` (HTTP), `node:child_process` execSync (git), `node:fs`/`node:path`/`node:os` (config I/O) — all existing; **no new dependencies**
**Storage**: JSON file at `~/.azdo/config.json` (existing; extended with an `organizations` map)
**Testing**: vitest via `npm run test:unit` / `npm run test:integration`; gates: `npm test && npm run lint && npm run build`
**Target Platform**: Node.js CLI (Windows / macOS / Linux)
**Project Type**: Single CLI project (existing flat `src/commands` + `src/services` structure)
**Performance Goals**: No regression on the happy path — zero extra HTTP requests when all configured fields exist; ≤2 extra requests on the degraded (missing-field) path
**Constraints**: Backward-compatible config file (FR-007); no behaviour change for single-org users (SC-006); git stderr never reaches the console (FR-015)
**Scale/Scope**: ~6 services touched, 1 command group extended (`config`), 2 services reworked (`git-remote`, `remote-warning`), 1 client path hardened (`getWorkItem`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. CLI-First Design | ✅ | New capability exposed as `azdo config` subcommands (`set/get/unset --org`, `org-copy`, `org-move`, `org-delete`); `config list` keeps `--json`; warnings to stderr; exit codes meaningful (missing-field degradation exits 0 by spec) |
| II. TypeScript Strictness | ✅ | New `OrgScopedConfig` types; no `any`; type guards for config file parsing |
| III. Single Responsibility | ✅ | Scope resolution isolated in `config-store.ts`; remote selection isolated in `git-remote.ts`; no command grows unrelated behaviour |
| IV. npm Distribution | ✅ | No new dependencies; tsup bundling unchanged |
| V. Simplicity | ✅ | Extends the existing config JSON (no new file format); no new abstraction layers — one resolution function, one remote-selection function. Config file already sanctioned by feature 003 |

**Post-design re-check (after Phase 1)**: ✅ unchanged — design adds no projects, no dependencies, no new storage formats.

## Project Structure

### Documentation (this feature)

```text
specs/025-multi-org-support/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (CLI command contracts)
│   └── cli-config.md
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── commands/
│   └── config.ts          # extended: --org on set/get/unset; org-copy/org-move/org-delete; scoped list
├── services/
│   ├── config-store.ts    # extended: organizations map, resolveScopedConfig(org), scope CRUD
│   ├── git-remote.ts      # reworked: enumerate all remotes, selection rules, stderr suppressed
│   ├── remote-warning.ts  # reworked: token-only trigger, names the remote, still once-per-process
│   ├── context.ts         # updated: project resolution becomes org-aware
│   ├── org-resolver.ts    # updated: error text no longer says "origin"
│   └── azdo-client.ts     # hardened: getWorkItem TF51535 fallback (validate fields, warn, retry)
└── commands/get-item.ts   # updated: scoped fields/markdown lookup after context resolution

tests/
├── unit/                  # config-store scopes, remote selection, warning trigger, TF51535 fallback
└── integration/           # config CLI surface (list/copy/move/delete, JSON shape)
```

**Structure Decision**: Existing single-project flat layout retained; all changes land in existing files plus unit/integration tests alongside the current suites.

## Phase 0 — Research

See [research.md](research.md). All NEEDS CLARIFICATION were resolved in the spec's Clarifications session (owner-approved); research covers the four implementation decisions: config schema layering, TF51535 recovery strategy, remote enumeration/selection rules, and git stderr suppression mechanics.

## Phase 1 — Design

- [data-model.md](data-model.md) — config file schema (default scope + `organizations` map), scope resolution semantics, remote-candidate model.
- [contracts/cli-config.md](contracts/cli-config.md) — full CLI contract for the extended `config` command group and changed runtime behaviours.
- [quickstart.md](quickstart.md) — end-to-end multi-org walkthrough used as the manual validation script.

## Complexity Tracking

No constitution violations — table not required.
