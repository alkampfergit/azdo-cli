# CLI Contract: Work Item Create by Type

**Date**: 2026-03-28
**Feature**: 009-work-item-create-type

## `azdo upsert`

### Synopsis

```bash
azdo upsert [id] (--content <markdown> | --file <path>) [--type <work item type>] [options]
```

### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
| `id` | No | Existing work item ID to update. Omit to create a new work item. |

### Options

| Option | Description |
| ------ | ----------- |
| `--content <markdown>` | Inline markdown work-item document |
| `--file <path>` | Read the markdown work-item document from disk |
| `--type <work item type>` | Create-mode work item type such as `Task`, `Bug`, `User Story`, `Feature`, or `Epic` |
| `--org <org>` | Azure DevOps organization |
| `--project <project>` | Azure DevOps project |
| `--json` | Output a JSON result object |

### Behavior

1. Validate that exactly one of `--content` or `--file` is present.
2. If `id` is omitted, treat the request as create mode.
3. In create mode, use `--type` when supplied; otherwise default to `Task`.
4. If `id` is present, reject `--type` before any Azure DevOps write.
5. Preserve the existing markdown document parsing and field-application behavior.
6. Include the resulting work item type in success output.

### Success Output

Human-readable output:

```text
Created Bug #12345 (System.Title, System.Description)
Updated User Story #23456 (System.Title, System.State)
```

JSON output:

```json
{
  "action": "created",
  "id": 12345,
  "workItemType": "Bug",
  "fields": {
    "System.Title": "Fix login bug"
  }
}
```

### Examples

```bash
# Create a Bug from inline content
azdo upsert --type Bug --content $'---\nTitle: Fix flaky login\nState: New\n---'

# Create a User Story from a file
azdo upsert --type "User Story" --file ./story.md

# Preserve existing Task default
azdo upsert --content $'---\nTitle: Follow-up task\n---'
```

### Error Messages

| Condition | stderr message |
| --------- | -------------- |
| `--type` used with update ID | `Error: --type can only be used when creating a work item.` |
| Empty `--type` value | `Error: --type must be a non-empty work item type.` |
| Invalid Azure DevOps type for project | `Error: Create rejected: <server message>` |
