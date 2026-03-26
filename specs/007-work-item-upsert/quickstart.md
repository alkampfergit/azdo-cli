# Quickstart: Work Item Upsert

**Feature**: 007-work-item-upsert

## Prerequisites

- Azure DevOps CLI (`azdo`) installed and authenticated with a PAT that can read and write work items
- Organization and project resolvable via `azdo config`, `--org` / `--project`, or Azure DevOps git remote detection

## Task Document Format

The command expects one markdown document with explicit YAML front matter followed by optional level-2 markdown heading sections (`## Field Name`).

```md
---
Title: Improve markdown import UX
Assigned To: user@example.com
State: New
Tags: cli; markdown
Priority: null
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
- Friendly names currently supported by the CLI are `Title`, `Assigned To`, `State`, `Description`, `Acceptance Criteria`, `Tags`, and `Priority`.
- Raw Azure DevOps reference names such as `System.Title` are also accepted.
- Empty scalar values or `null` request a clear.
- Present but empty markdown sections request a clear.

## Command Contract

```bash
# Create a new Task from inline content
azdo upsert --content $'---\nTitle: Improve CLI docs\nAssigned To: user@example.com\n---\n\n## Description\n\nDocument the new upsert workflow.'

# Update an existing Task from a file
azdo upsert 12345 --file ./task-import.md

# Machine-readable output
azdo upsert 12345 --file ./task-import.md --json
```

File cleanup behavior:
- Successful `--file` upserts delete the source file after the Azure DevOps response succeeds.
- Failed upserts leave the source file untouched.
- If deletion fails after success, the command still reports success and emits a warning.

## Implementation Steps

1. Add `src/commands/upsert.ts` to validate sources, resolve auth/context, invoke parser and client helpers, and handle post-success file deletion.
2. Add `src/services/task-document.ts` to parse front matter, split `##` sections, normalize aliases, detect duplicates, and build JSON Patch operations.
3. Extend `src/services/azdo-client.ts` with Task creation support while reusing the existing update transport and response shaping.
4. Register `createUpsertCommand()` in `src/index.ts`.
5. Add unit coverage for parsing, create/update behavior, source conflict validation, and file cleanup.

## Key Implementation Notes

1. Use `--content` instead of a positional inline document to avoid ambiguity with the optional work item ID.
2. Scalar clears use `null` or an empty YAML value; rich-text clears use an empty `##` section body.
3. Emit `/multilineFieldsFormat/<field> = Markdown` for every section-derived field so Azure DevOps stores rich-text content as markdown.
4. Delete `--file` inputs only after the Azure DevOps response confirms success.
5. Keep the alias table explicit and small; accept raw reference names for everything else.
