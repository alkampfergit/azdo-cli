# Quickstart: Work Item Upsert

**Feature**: 007-work-item-upsert

## Prerequisites

- Azure DevOps CLI (`azdo`) installed and authenticated with a PAT that can read and write work items
- Organization and project resolvable via `azdo config`, `--org` / `--project`, or Azure DevOps git remote detection

## Task Document Format

The command expects one markdown document with explicit YAML front matter followed by optional markdown sections.

```md
---
Title: Improve markdown import UX
Assigned To: user@example.com
State: New
System.Tags: cli; markdown
---

## Description

Implement a single-command task import flow.

## Acceptance Criteria

- Supports create when no ID is passed
- Supports update when an ID is passed
- Deletes imported files only after success
```

Rules:
- Front matter entries are treated as scalar field updates.
- `##` sections are treated as markdown field updates.
- Friendly names like `Title`, `Assigned To`, and `Acceptance Criteria` are normalized to Azure DevOps reference names.
- Empty scalar values or `null` request a clear.
- Present but empty markdown sections request a clear.

## Command Contract

```bash
# Create a new Task from inline content
azdo upsert --content "---
Title: Improve CLI docs
Assigned To: user@example.com
---

## Description

Document the new upsert workflow."

# Update an existing Task from a file
azdo upsert 12345 --file ./task-import.md

# Machine-readable output
azdo upsert 12345 --file ./task-import.md --json
```

## Implementation Steps

1. Add `src/commands/upsert.ts` to validate sources, resolve auth/context, invoke parser and client helpers, and handle post-success file deletion.
2. Add `src/services/task-document.ts` to parse front matter, split `##` sections, normalize aliases, detect duplicates, and build JSON Patch operations.
3. Extend `src/services/azdo-client.ts` with Task creation support while reusing the existing update transport and response shaping.
4. Register `createUpsertCommand()` in `src/index.ts`.
5. Add unit coverage for parsing, create/update behavior, source conflict validation, and file cleanup.

## Key Implementation Notes

1. Use `--content` instead of a positional inline document to avoid ambiguity with the optional work item ID.
2. Use the same empty-string clearing convention already used by `assign --unassign` for explicit clears.
3. Emit `/multilineFieldsFormat/<field> = Markdown` for every section-derived field so Azure DevOps stores rich-text content as markdown.
4. Delete `--file` inputs only after the Azure DevOps response confirms success.
5. Keep the alias table explicit and small; accept raw reference names for everything else.
