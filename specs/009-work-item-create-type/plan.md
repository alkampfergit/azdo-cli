# Implementation Plan: Work Item Create by Type

**Branch**: `009-work-item-create-type` | **Date**: 2026-03-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-work-item-create-type/spec.md`

## Summary

Extend `azdo upsert` create flows with a `--type <work item type>` option that selects the Azure DevOps work item type used in the create endpoint while preserving Task as the default, keeping update behavior unchanged, and reporting the resulting work item type in success output.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode) on Node.js LTS  
**Primary Dependencies**: commander.js, native `fetch`, node:fs, existing auth/context services  
**Storage**: N/A (reads inline/file input and writes to Azure DevOps API only)  
**Testing**: vitest  
**Target Platform**: Node.js LTS, cross-platform CLI  
**Project Type**: npm-distributed CLI tool  
**Performance Goals**: No additional network round-trips; one Azure DevOps write per invocation  
**Constraints**: Preserve backward compatibility for Task creation, keep the markdown document format unchanged, keep update semantics unchanged, and avoid adding metadata discovery or new dependencies  
**Scale/Scope**: One command option, one result-shape extension, focused tests, and README updates

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Check

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. CLI-First Design | PASS | The feature stays within the existing `upsert` command as a single additional option and preserves human and JSON output. |
| II. TypeScript Strictness | PASS | The option and result changes fit the existing explicit interface style with no `any`. |
| III. Single Responsibility Commands | PASS | `upsert` remains one command for synchronizing a work item from one markdown document. |
| IV. npm Distribution | PASS | No new dependencies or build tools are required. |
| V. Simplicity | PASS | The transport already accepts a dynamic work item type string, so the change is limited to command validation and output shaping. |

### Post-Design Check

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. CLI-First Design | PASS | The final contract is explicit: `--type` is create-only, defaults to Task, and is surfaced in success output. |
| II. TypeScript Strictness | PASS | Updated option and result interfaces remain narrowly typed. |
| III. Single Responsibility Commands | PASS | No new command or parser abstraction is introduced. |
| IV. npm Distribution | PASS | The implementation reuses the current transport and commander wiring. |
| V. Simplicity | PASS | No remote type discovery or document-format expansion is added. |

## Project Structure

### Documentation (this feature)

```text
specs/009-work-item-create-type/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── cli-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── commands/
│   └── upsert.ts
└── types/
    └── work-item.ts

tests/
└── unit/
    ├── upsert.test.ts
    └── azdo-client.test.ts

README.md
```

**Structure Decision**: Keep the change inside the existing `upsert` command path. The Azure DevOps client already supports a caller-provided create type, so no new service module is needed.

## Complexity Tracking

No constitution violations to justify. All gates pass.
