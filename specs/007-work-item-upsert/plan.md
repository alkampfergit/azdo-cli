# Implementation Plan: Work Item Upsert

**Branch**: `007-work-item-upsert` | **Date**: 2026-03-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-work-item-upsert/spec.md`

## Summary

Add a top-level `upsert` command that creates a new Azure DevOps Task when no ID is supplied and updates an existing Task when an ID is present. The command will accept exactly one markdown document source via `--content` or `--file`, parse YAML front matter into scalar field updates and level-2 markdown sections into rich-text field updates, normalize friendly field names and raw Azure DevOps reference names, reuse the existing auth/context resolution flow, validate a non-empty Title locally for create requests, surface additional Azure DevOps validation errors clearly, and delete imported files only after a confirmed successful create or update.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode) on Node.js LTS  
**Primary Dependencies**: commander.js (CLI framework), node-html-markdown (existing rich-text support), node:fs/node:path (built-in file handling); no new parser dependency planned  
**Storage**: N/A (reads inline/file input and writes to Azure DevOps API only)  
**Testing**: vitest  
**Target Platform**: Node.js LTS, cross-platform CLI  
**Project Type**: npm-distributed CLI tool  
**Performance Goals**: One local parse and one Azure DevOps request for updates; create flow may use an additional validation/create round-trip only if needed, with negligible local overhead for typical task documents  
**Constraints**: Preserve existing auth and org/project resolution behavior; accept exactly one content source; remove source files only after confirmed success; keep runtime dependencies minimal; validate non-empty Title locally for create requests; report actionable local and Azure DevOps validation errors before destructive cleanup  
**Scale/Scope**: One new top-level command, one parser/field-normalization service, Azure DevOps client create support, focused unit coverage for parser, command behavior, and API transport

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Check

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. CLI-First Design | PASS | `upsert` is a single commander.js command with one optional ID argument and explicit `--content` / `--file` sources. It will support human-readable and `--json` output, write success to stdout, and report errors to stderr with exit code 1. |
| II. TypeScript Strictness | PASS | Parser, field normalization, and API payload builders will use explicit interfaces and strict typing. No `any` is needed. |
| III. Single Responsibility Commands | PASS | The command performs one cohesive operation: synchronize one Azure DevOps Task from one task-definition document. Shared parsing and transport logic stays in `src/services/`. |
| IV. npm Distribution | PASS | Plan keeps the dependency set flat by avoiding a new front-matter/YAML runtime dependency unless implementation evidence later forces it. |
| V. Simplicity | PASS | The design uses an explicit alias table, a small document parser, and existing Azure DevOps client patterns rather than metadata discovery or generalized schema engines. |

### Post-Design Check

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. CLI-First Design | PASS | Contract defines a clear synopsis, exact source validation, JSON output, and deterministic success/error behavior for create and update. |
| II. TypeScript Strictness | PASS | Data model and patch-plan entities are fully typed and map directly to existing service boundaries. |
| III. Single Responsibility Commands | PASS | Parsing, canonicalization, and file-cleanup concerns are separated into service helpers while `upsert` remains the only command added. |
| IV. npm Distribution | PASS | Design still fits the current bundle model with no required runtime dependency increase. |
| V. Simplicity | PASS | Field type is inferred by document location (front matter vs section) rather than remote metadata lookups, keeping the command predictable and testable. |

## Project Structure

### Documentation (this feature)

```text
specs/007-work-item-upsert/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── cli-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── commands/
│   └── upsert.ts                # NEW: create/update Task from one markdown document
├── services/
│   ├── azdo-client.ts           # MODIFIED: add Task create support and shared patch response handling
│   ├── command-helpers.ts       # MODIFIED: extend user-facing error handling if upsert adds new failures
│   └── task-document.ts         # NEW: parse front matter, sections, aliases, and patch plans
└── index.ts                     # MODIFIED: register upsert command

tests/
└── unit/
    ├── task-document.test.ts    # NEW: parser and normalization coverage
    ├── upsert.test.ts           # NEW: CLI behavior and cleanup coverage
    └── azdo-client.test.ts      # MODIFIED: create Task transport coverage
```

**Structure Decision**: Follow the existing flat `src/commands/` and `src/services/` structure. Keep command orchestration thin and place document parsing plus patch generation in a dedicated service so the implementation stays testable without creating extra layers.

## Complexity Tracking

No constitution violations to justify. All gates pass.

