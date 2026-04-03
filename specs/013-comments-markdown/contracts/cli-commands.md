# CLI Command Contracts: Comments Markdown Support

## `azdo comments add <id> <text> [--markdown] [--org] [--project] [--json]`

### Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | yes | Work item ID |
| text | string | yes | Comment body |

### Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| --markdown | boolean | false | Post comment as markdown (signals markdown format to API) |
| --org | string | (from config/env) | Azure DevOps org |
| --project | string | (from config/env) | Azure DevOps project |
| --json | boolean | false | Output raw JSON |

### Stdout (human-readable, no --json)

```
Added comment #<commentId> to work item #<workItemId>
```

### Stdout (--json)

```json
{
  "workItemId": 42,
  "commentId": 77,
  "text": "...",
  "author": "...",
  "createdAt": "...",
  "url": "..."
}
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Validation error or API error |

---

## `azdo comments list <id> [--markdown] [--org] [--project] [--json]`

### Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | yes | Work item ID |

### Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| --markdown | boolean | false | Convert HTML comment bodies to markdown before display |
| --org | string | (from config/env) | Azure DevOps org |
| --project | string | (from config/env) | Azure DevOps project |
| --json | boolean | false | Output raw JSON (no markdown conversion) |

### Stdout (human-readable, no --json)

```
Comments for work item #<id>

Comment #<id> by <author> at <timestamp>
<body — converted to markdown if --markdown and original was HTML>

...
```

### Stdout (--json)

Raw `WorkItemCommentsResult` JSON — text fields are NEVER converted regardless of --markdown.

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | API error |
