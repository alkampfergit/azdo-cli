# Implementation Plan: AzDO CLI Base

**Branch**: `001-azdo-cli-base` | **Date**: 2026-03-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-azdo-cli-base/spec.md`

## Summary

Build a minimal CLI tool (`azdo`) distributed via npm as `azdo-cli`, supporting only `--version` and `--help` flags. The CLI is implemented in TypeScript with commander.js, bundled into a single file by tsup, and distributed through an automated GitHub Actions pipeline that builds on every push, publishes to npm on all branches (with pre-release tags for non-master), and creates GitHub Releases only on master.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode) on Node.js LTS
**Primary Dependencies**: commander.js (CLI framework), tsup (bundler)
**Storage**: N/A
**Testing**: vitest
**Target Platform**: Cross-platform (Windows, macOS, Linux) via Node.js
**Project Type**: CLI
**Performance Goals**: N/A (trivial operations — version and help output)
**Constraints**: Single bundled file, zero runtime dependencies after install
**Scale/Scope**: 2 commands (--version, --help), single developer/maintainer initially

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. CLI-First Design | PASS | Commander.js commands with POSIX conventions, meaningful exit codes |
| II. TypeScript Strictness | PASS | strict: true, no `any`, explicit types on exports |
| III. Single Responsibility Commands | PASS | Only --version and --help; no combined operations |
| IV. npm Distribution | PASS | tsup bundler, bin field in package.json, files whitelist, minimal deps |
| V. Simplicity | PASS | Minimal implementation — two flags, flat structure, no abstractions |

**Gate result**: PASS — no violations. Proceeding to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/001-azdo-cli-base/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── cli-interface.md
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── index.ts             # Entry point — CLI setup with commander.js
└── version.ts           # Version reading from package.json

.github/
└── workflows/
    └── ci.yml           # Build, publish, release pipeline

package.json             # npm package config (name: azdo-cli, bin: azdo)
tsconfig.json            # TypeScript strict config
tsup.config.ts           # Bundler config — single file output
```

**Structure Decision**: Flat single-project structure per Constitution Principle V (Simplicity). Only two source files needed — the CLI entry point and a version utility. No nested models/services/lib directories since the scope is two flags.

## Complexity Tracking

> No violations detected. No entries needed.
