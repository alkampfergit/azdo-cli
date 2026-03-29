# CLI Contract: Work Item Comments

**Date**: 2026-03-28
**Feature**: 010-work-item-comments

## `azdo comments`

### Synopsis

```bash
azdo comments list <id> [options]
azdo comments add <id> <text> [options]
```

### Shared Options

| Option | Description |
| ------ | ----------- |
| `--org <org>` | Azure DevOps organization override |
| `--project <project>` | Azure DevOps project override |
| `--json` | Output a JSON result object |

## `azdo comments list`

### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
| `id` | Yes | Work item ID whose comment history should be read |

### Behavior

1. Validate that `id` is a positive integer.
2. Resolve org/project from overrides or existing config.
3. Resolve the PAT using the existing auth flow.
4. Retrieve the full visible work item comment history from Azure DevOps, following pagination internally.
5. Exclude deleted comments from the default result set.
6. Order comments newest first.
7. Print either human-readable output or JSON.

### Success Output

Human-readable output with comments:

```text
Comments for work item #123

Comment #51 by Alice at 2026-03-28T10:15:00Z
Investigating the failing pipeline.

Comment #49 by Bob at 2026-03-27T19:02:11Z
Handed off after reproducing the bug.
```

Human-readable output with no comments:

```text
Work item #123 has no comments.
```

JSON output:

```json
{
  "workItemId": 123,
  "count": 2,
  "comments": [
    {
      "id": 51,
      "workItemId": 123,
      "text": "Investigating the failing pipeline.",
      "author": "Alice",
      "createdAt": "2026-03-28T10:15:00Z",
      "modifiedAt": "2026-03-28T10:15:00Z",
      "isDeleted": false
    }
  ]
}
```

## `azdo comments add`

### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
| `id` | Yes | Work item ID that will receive the new comment |
| `text` | Yes | New comment text |

### Behavior

1. Validate that `id` is a positive integer.
2. Validate that `text` remains non-empty after trimming.
3. Resolve org/project and PAT using the existing flows.
4. Submit the comment text to Azure DevOps.
5. Print either human-readable output or JSON describing the created comment.

### Success Output

Human-readable output:

```text
Added comment #77 to work item #123
```

JSON output:

```json
{
  "workItemId": 123,
  "commentId": 77,
  "text": "Investigation complete.",
  "author": "Alice",
  "createdAt": "2026-03-28T10:20:00Z",
  "url": "https://dev.azure.com/example/project/_apis/wit/workItems/123/comments/77"
}
```

### Error Messages

| Condition | stderr message |
| --------- | -------------- |
| Invalid work item ID | `Error: Work item ID must be a positive integer. Got: "<value>"` |
| Empty comment text | `Error: Comment text must be a non-empty string.` |
| Missing work item | `Error: Work item <id> not found in <org>/<project>.` |
| Auth failure | `Error: Authentication failed. Check that your PAT is valid and has the "Work Items (read)" or "Work Items (Read & Write)" scope.` |
