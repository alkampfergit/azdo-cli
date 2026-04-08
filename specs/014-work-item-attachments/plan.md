# Implementation Plan: Work Item Attachments

**Branch**: `014-work-item-attachments` | **Date**: 2026-04-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/014-work-item-attachments/spec.md`

## Summary

Add attachment awareness to the existing `get-item` command and introduce a new `download-attachment` command. The `get-item` command will be enhanced to include attachment metadata (filename, size) by requesting the `relations` expand from the Azure DevOps Work Items API. A new `download-attachment` command will fetch attachment binary content using the attachment download URL and save it to disk.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode) on Node.js LTS (18+)
**Primary Dependencies**: commander.js (CLI framework), native `fetch` (HTTP)
**Storage**: N/A (reads from Azure DevOps API, writes binary files to local filesystem)
**Testing**: vitest
**Target Platform**: Node.js LTS (cross-platform)
**Project Type**: CLI tool
**Performance Goals**: N/A (single work item operations)
**Constraints**: No new runtime dependencies
**Scale/Scope**: Single work item attachments per invocation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| CLI-First Design | PASS | New `download-attachment` command follows commander.js patterns |
| TypeScript Strictness | PASS | All new code will use strict mode, explicit types, no `any` |
| Single Responsibility | PASS | `download-attachment` does one thing; attachment listing is part of work item display |
| npm Distribution | PASS | No new dependencies added |
| Simplicity | PASS | Minimal additions to existing patterns, no new abstractions |

## Project Structure

### Documentation (this feature)

```text
specs/014-work-item-attachments/
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   └── download-attachment-cli.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── commands/
│   ├── get-item.ts          # Modified: add attachment display
│   └── download-attachment.ts  # New: download command
├── services/
│   └── azdo-client.ts       # Modified: add getWorkItemAttachments, downloadAttachment
├── types/
│   └── work-item.ts         # Modified: add WorkItemAttachment interface
└── index.ts                 # Modified: register new command

tests/
└── unit/
    ├── get-item-attachments.test.ts   # New: test attachment display in get-item
    └── download-attachment.test.ts     # New: test download command
```

**Structure Decision**: Follows existing flat module structure. New command file under `src/commands/`, service functions added to existing `azdo-client.ts`, types in existing `work-item.ts`.

## Architecture

### Attachment Data Flow

1. **get-item with attachments**: The existing `getWorkItem` function will be modified to request `$expand=relations` from the API. Relations of type `AttachedFile` will be extracted and returned as part of the `WorkItem` type with an optional `attachments` array.

2. **download-attachment**: The new command will:
   - Call `getWorkItem` (with relations) to get the list of attachments
   - Find the attachment matching the given filename
   - Use the attachment URL to download the binary content via authenticated `fetch`
   - Write the content to disk using `node:fs`

### Azure DevOps API

- **Get work item with relations**: `GET /_apis/wit/workitems/{id}?$expand=relations&api-version=7.1`
- **Download attachment**: `GET /_apis/wit/attachments/{id}?api-version=7.1` (the URL is provided in the relation data)

The relations array contains objects with `rel: "AttachedFile"`, `url` (the attachment download URL), and `attributes` containing `name` (filename) and `resourceSize` (bytes).
