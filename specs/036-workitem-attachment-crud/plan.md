# Implementation Plan: Work Item Attachment Create/Delete

**Branch**: `036-workitem-attachment-crud` | **Date**: 2026-08-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/036-workitem-attachment-crud/spec.md`

## Summary

Add `azdo add-attachment <id> <file>` (upload + link, with an optional comment, always appending rather than replacing on a filename collision) and `azdo delete-attachment <id> <filename>` (unlink, with an interactive confirmation prompt and `--yes` override, disambiguated by a `--id <guid>` flag when a filename is shared by more than one attachment). Both are flat top-level commands matching the existing `download-attachment` command's surface. Implementation is a two-call sequence against the existing Azure DevOps Work Item Tracking REST API (upload attachment → PATCH the work item's `relations`), reusing the repo's existing `applyWorkItemPatch`, `fetchWithErrors`/`writeHeaders`, and `promptYesNo` (auth.ts) patterns — no new dependencies.

## Technical Context

**Language/Version**: TypeScript 5.x (`strict: true`) on Node.js LTS (18+) — unchanged
**Primary Dependencies**: commander.js (CLI, existing), native `fetch` (HTTP, existing) — no new dependencies
**Storage**: N/A (reads a local file to upload; all state lives in Azure DevOps)
**Testing**: vitest — unit (`tests/unit/`) + integration (`tests/integration/`), per existing repo convention (`npm test`, `npm run test:unit`, `npm run test:integration`)
**Target Platform**: Cross-platform Node.js CLI (Linux/macOS/Windows)
**Project Type**: Single project (CLI) — Option 1 below
**Performance Goals**: N/A — single-attachment, single-work-item, interactive CLI operations; no throughput target
**Constraints**: Azure DevOps enforces 100 attachments/work item and (typically) 60 MB/file server-side; not re-implemented client-side (see research.md)
**Scale/Scope**: 2 new commands, 1 new service function (`createAttachment` upload), small extensions to `WorkItemAttachment` and to `applyWorkItemPatch` call sites — no new modules beyond the two command files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. CLI-First Design | PASS | Two new commander commands (`add-attachment`, `delete-attachment`), POSIX-style args/stdout/stderr, meaningful exit codes; see contracts/cli-commands.md. `--json` not applicable — these are action commands with a one-line confirmation, matching `download-attachment`'s existing precedent of no `--json`. |
| II. TypeScript Strictness | PASS | No `any`; `WorkItemAttachment.id` typed `string`; new service function fully typed against existing `AzdoContext`/`AuthCredential`/`JsonPatchOperation`. |
| III. Single Responsibility Commands | PASS | Attach and delete are separate commands (not subcommands of one), matching `download-attachment`'s existing pattern rather than introducing a new `work-item attachment <verb>` subcommand tree. |
| IV. npm Distribution | PASS | No new runtime dependencies; nothing to add to `files` whitelist beyond the two new compiled command files (automatic via existing build glob). |
| V. Simplicity | PASS | Reuses `applyWorkItemPatch`, `fetchWithErrors`, `writeHeaders`, `handleCommandError`, `parseWorkItemId`, `validateOrgProjectPair`, and lifts `promptYesNo` into the shared helpers module instead of duplicating it. No new abstraction layers. |
| VI. Azure DevOps API Research | PASS | Researched via Microsoft Learn MCP before this plan: `wit/attachments/create`, work item `relations` JSON Patch semantics (`AttachedFile` rel, `attributes.comment`), and confirmed no dedicated attachment-delete endpoint exists (unlink-via-relation-removal is the documented mechanism). See research.md. |

No violations — Complexity Tracking section omitted.

## Project Structure

### Documentation (this feature)

```text
specs/036-workitem-attachment-crud/
├── plan.md              # This file
├── research.md           # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── cli-commands.md   # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit.tasks — not created here)
```

### Source Code (repository root)

```text
src/
├── commands/
│   ├── add-attachment.ts       # NEW — createAddAttachmentCommand()
│   ├── delete-attachment.ts    # NEW — createDeleteAttachmentCommand()
│   └── download-attachment.ts  # existing — pattern this feature follows
├── services/
│   ├── azdo-client.ts          # extend: createAttachment(), extractAttachments() gains id
│   └── command-helpers.ts      # extend: lift promptYesNo() here from commands/auth.ts
├── types/
│   └── work-item.ts            # extend: WorkItemAttachment.id
└── index.ts                    # register the two new commands

tests/
├── unit/
│   ├── add-attachment.test.ts     # NEW
│   └── delete-attachment.test.ts  # NEW
└── integration/
    └── work-item-attachments.test.ts  # NEW (SKIP_AZDO-gated, matches existing integration convention)
```

**Structure Decision**: Single project (existing flat `src/{commands,services,types}` layout). No new top-level directories — this feature is two more files in `commands/`, following `download-attachment.ts` exactly.

## Phase 0: Outline & Research

Complete — see [research.md](./research.md). All technical unknowns (upload endpoint, relation-based linking, comment field, delete mechanism, ID source, confirmation-prompt reuse, limits handling) resolved; no `NEEDS CLARIFICATION` markers remain.

## Phase 1: Design & Contracts

Complete — see [data-model.md](./data-model.md) (WorkItemAttachment extension, command input rules, state transitions) and [contracts/cli-commands.md](./contracts/cli-commands.md) (full CLI surface: args, options, stdout/stderr shapes, exit behavior). [quickstart.md](./quickstart.md) walks through attach → verify → delete, including the ambiguous-filename path.

Agent context update: `.specify/scripts/bash/update-agent-context.sh` targets Claude Code / Codex-style agent files; this repo's authoritative agent memory is `AGENTS.md` (per its own header — "Codex Memory: keep repository memory here rather than in CLAUDE.md"). Ran with the `codex` argument per the template's Phase 1 step; see script output below.

## Complexity Tracking

*No entries — no Constitution Check violations.*
