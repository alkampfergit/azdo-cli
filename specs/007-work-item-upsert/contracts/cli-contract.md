# CLI Contract: Work Item Upsert

**Date**: 2026-03-24
**Feature**: 007-work-item-upsert

## `azdo upsert`

### Synopsis

```bash
azdo upsert [id] (--content <markdown> | --file <path>) [options]
```

### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
| `id` | No | Existing Task work item ID. Omit to create a new Task. |

### Options

| Option | Description |
| ------ | ----------- |
| `--content <markdown>` | Inline task-definition markdown document |
| `--file <path>` | Read the task-definition markdown document from disk |
| `--org <org>` | Azure DevOps organization |
| `--project <project>` | Azure DevOps project |
| `--json` | Output a JSON result object |

### Document Format

The document must start with explicit YAML front matter and may continue with level-2 markdown heading sections (`## Field Name`).

```md
---
Title: Improve task import flow
Assigned To: user@example.com
State: Active
System.Tags: cli; import
---

## Description

Implement single-command task create or update from markdown.

## Acceptance Criteria

- One document can update multiple fields
- File imports are deleted only after success
```

Normalization rules:
- Friendly names for known fields are accepted case-insensitively.
- Raw Azure DevOps reference names are accepted directly.
- Front matter entries become scalar field updates.
- Section entries become markdown field updates.
- Duplicate canonical field declarations are rejected.

### Supported Friendly Name Aliases

| Friendly name | Canonical field |
| ------------- | --------------- |
| `Title` | `System.Title` |
| `Assigned To` | `System.AssignedTo` |
| `State` | `System.State` |
| `Description` | `System.Description` |
| `Acceptance Criteria` | `Microsoft.VSTS.Common.AcceptanceCriteria` |
| `Repro Steps` | `Microsoft.VSTS.TCM.ReproSteps` |
| `Area Path` | `System.AreaPath` |
| `Iteration Path` | `System.IterationPath` |

### Behavior

1. Validate that exactly one of `--content` or `--file` is present.
2. Resolve organization/project using the existing flags/config/git-remote precedence.
3. Parse the markdown document into scalar and markdown field entries.
4. Normalize friendly names to reference names and reject malformed, duplicate, or ambiguous declarations.
5. If `id` is omitted, create a new Task via Azure DevOps.
6. If `id` is present, update only the explicitly declared fields on that Task.
7. If the source was `--file`, delete the source file only after the API operation succeeds.

### Success Output

Human-readable output:

```text
Created task 12345 with fields: System.Title, System.AssignedTo, System.Description
Updated task 12345 with fields: System.State, System.Description
```

JSON output:

```json
{
  "action": "created",
  "id": 12345,
  "rev": 1,
  "title": "Improve task import flow",
  "fields": [
    "System.Title",
    "System.AssignedTo",
    "System.Description"
  ],
  "deletedSourceFile": true
}
```

### Examples

```bash
# Create from inline markdown
azdo upsert --content "---
Title: Add task upsert command
Assigned To: user@example.com
---

## Description

Add a single command that imports a task definition."

# Update an existing Task from a file
azdo upsert 12345 --file ./task.md

# Update an existing Task and request JSON output
azdo upsert 12345 --file ./task.md --json
```

### Error Messages

| Condition | stderr message |
| --------- | -------------- |
| Missing content source | `Error: Provide exactly one task document source using --content or --file.` |
| Both content sources provided | `Error: Provide exactly one task document source using --content or --file.` |
| Invalid work item ID | `Error: Work item ID must be a positive integer. Got: "<input>"` |
| File not found | `Error: File not found: <path>` |
| File not readable | `Error: Cannot read file: <path>` |
| Missing front matter | `Error: Task document must start with YAML front matter delimited by ---.` |
| Duplicate field declaration | `Error: Field "<field>" is declared more than once in the task document.` |
| Unknown friendly field | `Error: Field "<field>" is not a supported friendly field name. Use a known friendly name or an Azure DevOps reference name.` |
| Missing Title on create | `Error: Task creation requires a non-empty Title field.` |
| Work item not found | `Error: Work item <id> not found in <org>/<project>.` |
| Update rejected | `Error: Update rejected: <server message>` |
| Create rejected | `Error: Create rejected: <server message>` |
| Org/project missing | `Error: Could not determine org/project. Use --org and --project flags, work from an Azure DevOps git repo, or run "azdo config set org/project".` |
