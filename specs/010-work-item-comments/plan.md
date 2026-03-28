# Implementation Plan: Work Item Comments

**Branch**: `010-work-item-comments` | **Date**: 2026-03-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-work-item-comments/spec.md`

## Summary

Add a top-level `azdo comments` command group with `list` and `add` subcommands so users and agents can read work item discussion history and post progress updates from the terminal. The implementation will reuse the existing Azure DevOps work item transport in `azdo-client.ts`, add comment-specific result types in `work-item.ts`, page through Azure DevOps comment history until completion, and provide both human-readable and JSON output without adding new dependencies.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode) on Node.js LTS  
**Primary Dependencies**: commander.js, native `fetch`, existing auth/context helpers, node:fs only where already present  
**Storage**: N/A (reads from and writes to Azure DevOps Work Item Tracking APIs only)  
**Testing**: vitest  
**Target Platform**: Node.js LTS, cross-platform CLI  
**Project Type**: npm-distributed CLI tool  
**Performance Goals**: One API write for `comments add`; bounded paged reads for `comments list`; no unnecessary extra network round-trips beyond comment pagination  
**Constraints**: No new runtime dependencies; preserve existing `--org`/`--project` overrides and stderr/stdout conventions; Azure DevOps work item comment endpoints use `7.1-preview.4`; deleted comments stay out of default results  
**Scale/Scope**: One new command module, focused additions to the existing work item client and types, new unit coverage, README updates

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Check

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. CLI-First Design | PASS | The feature is exposed as explicit `comments list` and `comments add` subcommands with human and JSON output. |
| II. TypeScript Strictness | PASS | The new result shapes and API mappings fit the current explicit-interface style with no `any`. |
| III. Single Responsibility Commands | PASS | `comments list` only reads history; `comments add` only creates a comment. |
| IV. npm Distribution | PASS | No new dependencies or build tooling are required. |
| V. Simplicity | PASS | The work item client already owns WIT HTTP behavior, so comment support can extend it instead of creating a parallel transport layer. |

### Post-Design Check

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. CLI-First Design | PASS | The command contract remains explicit and scriptable, with `--json`, stdout/stderr separation, and meaningful exit behavior. |
| II. TypeScript Strictness | PASS | Comment entities, list results, and create results remain narrowly typed and locally mapped. |
| III. Single Responsibility Commands | PASS | No command mixes reading history with writing updates. |
| IV. npm Distribution | PASS | The design uses only the existing stack and package structure. |
| V. Simplicity | PASS | Comment read/write functions stay in `azdo-client.ts`, keeping all work-item REST logic together. |

## Project Structure

### Documentation (this feature)

```text
specs/010-work-item-comments/
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
│   └── comments.ts          # NEW — comments command group with list/add subcommands
├── services/
│   └── azdo-client.ts       # EXTEND — work item comment list/add transport and mapping
├── types/
│   └── work-item.ts         # EXTEND — comment entities and command result types
└── index.ts                 # EXTEND — register createCommentsCommand()

tests/
└── unit/
    ├── azdo-client.test.ts  # EXTEND — comment list/add transport behavior
    ├── comments-add.test.ts # NEW — command validation and success/error output
    └── comments-list.test.ts# NEW — list formatting, empty state, JSON, paging result usage

README.md                    # EXTEND — comments command usage and examples
```

**Structure Decision**: Keep work item comments inside the existing work item transport and type modules. The CLI surface is new, but the Azure DevOps domain is the same as existing work item reads and writes, so a new transport package or deep module split would add needless indirection.

## Phase 0: Research

All open questions were resolved in [research.md](./research.md).

Key decisions:

- Keep a dedicated `comments` command group rather than overloading `get-item` or `upsert`
- Extend `azdo-client.ts` instead of adding a parallel work item comments transport
- Page through Azure DevOps work item comments until the full visible history is retrieved
- Use newest-first output and exclude deleted comments by default
- Keep `comments add` input as a required positional text argument

## Phase 1: Design & Contracts

See [data-model.md](./data-model.md), [quickstart.md](./quickstart.md), and [contracts/cli-contract.md](./contracts/cli-contract.md).

### `src/services/azdo-client.ts` additions

Add two exported functions:

```typescript
export async function listWorkItemComments(
  context: AzdoContext,
  id: number,
  pat: string,
): Promise<WorkItemCommentsResult>

export async function addWorkItemComment(
  context: AzdoContext,
  id: number,
  pat: string,
  text: string,
): Promise<AddWorkItemCommentResult>
```

`listWorkItemComments()` loops through continuation tokens internally and returns one aggregated result. `addWorkItemComment()` posts the comment text and maps the Azure DevOps response into a stable CLI result shape.

### `src/commands/comments.ts`

Add a top-level command factory:

```typescript
export function createCommentsCommand(): Command
```

It registers two subcommands:

- `createCommentsListCommand()`
- `createCommentsAddCommand()`

Each subcommand follows the existing command flow: validate inputs, resolve context, resolve PAT, call the service, format output, and route known failures through the existing command error helpers.

### `src/index.ts`

Register the new command:

```typescript
import { createCommentsCommand } from './commands/comments.js';
// ...
program.addCommand(createCommentsCommand());
```

## Implementation Order

1. Extend `src/types/work-item.ts` with comment entities and result types.
2. Extend `src/services/azdo-client.ts` with comment list/add transport and mapping helpers.
3. Add unit coverage for the new azdo client behavior, including pagination and deleted-comment filtering.
4. Add `src/commands/comments.ts` with list/add subcommands.
5. Add unit coverage for command validation, human-readable output, empty-state behavior, JSON output, and service error wiring.
6. Register the new command in `src/index.ts`.
7. Update `README.md` with usage and examples.

## Test Strategy

- **Unit tests only** for the implementation slice; mock `fetch`, `resolvePat`, and `resolveContext`.
- Extend `tests/unit/azdo-client.test.ts` for:
  - paged comment retrieval
  - newest-first aggregation
  - deleted-comment exclusion
  - add-comment request/response mapping
- Add `tests/unit/comments-list.test.ts` for:
  - empty-state success
  - rendered comment blocks
  - JSON output
  - read-path error propagation
- Add `tests/unit/comments-add.test.ts` for:
  - whitespace-only rejection
  - success output
  - JSON output
  - write-path error propagation

## Complexity Tracking

No constitution violations to justify. All gates pass.
