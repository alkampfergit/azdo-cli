# CLI Command Contracts: `azdo relations`

**Branch**: `027-work-item-relations`
**Date**: 2026-06-10

---

## `azdo relations types`

Lists all work item relation types available in the organisation.

```
azdo relations types [--json]
```

### Options

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Output as JSON array |

### Human output format

```
Available work item relation types:

Child                   System.LinkTypes.Hierarchy-Forward
Parent                  System.LinkTypes.Hierarchy-Reverse
Related                 System.LinkTypes.Related
Predecessor             System.LinkTypes.Dependency-Reverse
Successor               System.LinkTypes.Dependency-Forward
Duplicate               System.LinkTypes.Duplicate-Forward
Duplicate Of            System.LinkTypes.Duplicate-Reverse
...
```

Only `workItemLink` types where `enabled === true` are shown. Resource links (Attachments, Hyperlinks, Artifact Links) are excluded.

### JSON output shape

```json
[
  {
    "referenceName": "System.LinkTypes.Hierarchy-Forward",
    "name": "Child",
    "usage": "workItemLink",
    "enabled": true,
    "directional": true
  }
]
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Auth failure / network error |

---

## `azdo relations add <type> <id1> <id2>`

Adds a directed relation of `<type>` from work item `<id1>` to work item `<id2>`.

```
azdo relations add <type> <id1> <id2> [--json]
```

### Arguments

| Arg | Type | Description |
|-----|------|-------------|
| `type` | string | Relation type name (case-insensitive display name, e.g. `child`) |
| `id1` | number | Source work item ID (the anchor) |
| `id2` | number | Target work item ID |

### Options

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Output result as JSON |

### Human output format (success)

```
Added relation: #1000 --[Child]--> #2000
```

### Human output format (already exists — idempotent)

```
Relation already exists: #1000 --[Child]--> #2000
```

### JSON output shape

```json
{
  "status": "added",
  "type": "Child",
  "referenceName": "System.LinkTypes.Hierarchy-Forward",
  "id1": 1000,
  "id2": 2000
}
```

`"status"` is `"added"` or `"already_exists"`.

### Error messages

| Condition | Message |
|-----------|---------|
| `id1 == id2` | `Error: cannot relate a work item to itself (#1000)` |
| Unknown type | `Error: unknown relation type "foo". Run 'azdo relations types' to see valid names.` |
| Work item not found | `Error: work item #9999 not found` |
| Auth failure | `Error: authentication failed. Check your PAT has Work Items → Read & Write scope.` |

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success (added or already existed) |
| 1 | Error |

---

## `azdo relations remove <type> <id1> <id2>`

Removes an existing relation of `<type>` between work items `<id1>` and `<id2>`.

```
azdo relations remove <type> <id1> <id2> [--json]
```

### Arguments

Same as `add`.

### Human output format (success)

```
Removed relation: #1000 --[Child]--> #2000
```

### Human output format (not found)

```
No relation of type 'Child' found between #1000 and #2000
```

### JSON output shape

```json
{
  "status": "removed",
  "type": "Child",
  "referenceName": "System.LinkTypes.Hierarchy-Forward",
  "id1": 1000,
  "id2": 2000
}
```

`"status"` is `"removed"` or `"not_found"`.

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success (removed or not found — both non-error outcomes) |
| 1 | Error (auth failure, work item not found, unknown type) |

---

## `azdo relations list <id>`

Lists all work-item-link relations on the specified work item.

```
azdo relations list <id> [--json]
```

### Arguments

| Arg | Type | Description |
|-----|------|-------------|
| `id` | number | Work item ID to inspect |

### Human output format (with relations)

```
Relations for work item #1000:

[Child]       #2000  Implement login UI
[Child]       #2001  Write login unit tests
[Parent]      #999   Epic: Authentication
[Related]     #1050  Related spike
```

### Human output format (no relations)

```
Work item #1000 has no relations.
```

### JSON output shape

```json
{
  "workItemId": 1000,
  "relations": [
    {
      "rel": "System.LinkTypes.Hierarchy-Forward",
      "relName": "Child",
      "targetId": 2000,
      "targetTitle": "Implement login UI",
      "targetUrl": "https://dev.azure.com/org/_apis/wit/workItems/2000",
      "comment": null
    }
  ]
}
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success (including zero relations) |
| 1 | Error |
