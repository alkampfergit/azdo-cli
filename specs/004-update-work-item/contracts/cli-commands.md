# CLI Command Contracts: Update Work Item

## `azdo set-state <id> <state>`

**Description**: Change the state of a work item.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | positional | yes | Work item ID (positive integer) |
| `state` | positional | yes | Target state name (e.g., "Active", "Closed") |
| `--org` | option | no | Azure DevOps organization |
| `--project` | option | no | Azure DevOps project |
| `--json` | flag | no | Output result as JSON |

**Success output (human)**:
```
Updated work item 19007: State -> Active
```

**Success output (JSON)**:
```json
{"id":19007,"rev":3,"title":"My Work Item","field":"System.State","value":"Active"}
```

**Exit codes**: 0 = success, 1 = error

---

## `azdo assign <id> [name]`

**Description**: Assign a work item to a user, or unassign it.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | positional | yes | Work item ID (positive integer) |
| `name` | positional | no | User display name or email (required unless `--unassign`) |
| `--unassign` | flag | no | Clear the Assigned To field |
| `--org` | option | no | Azure DevOps organization |
| `--project` | option | no | Azure DevOps project |
| `--json` | flag | no | Output result as JSON |

**Validation**: Either `name` or `--unassign` must be provided, but not both.

**Success output (human)**:
```
Updated work item 19007: Assigned To -> Gian Maria Ricci
```

**Success output (unassign, human)**:
```
Updated work item 19007: Assigned To -> (unassigned)
```

**Success output (JSON)**:
```json
{"id":19007,"rev":3,"title":"My Work Item","field":"System.AssignedTo","value":"Gian Maria Ricci"}
```

**Exit codes**: 0 = success, 1 = error

---

## `azdo set-field <id> <field> <value>`

**Description**: Set any work item field by its reference name.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | positional | yes | Work item ID (positive integer) |
| `field` | positional | yes | Field reference name (e.g., `System.Title`) |
| `value` | positional | yes | New value for the field |
| `--org` | option | no | Azure DevOps organization |
| `--project` | option | no | Azure DevOps project |
| `--json` | flag | no | Output result as JSON |

**Success output (human)**:
```
Updated work item 19007: System.Title -> New title
```

**Success output (JSON)**:
```json
{"id":19007,"rev":3,"title":"My Work Item","field":"System.Title","value":"New title"}
```

**Exit codes**: 0 = success, 1 = error

---

## Shared Error Messages

All commands produce the same error messages for common failures:

| Condition | stderr message |
|-----------|---------------|
| Invalid ID | `Error: Work item ID must be a positive integer. Got: "abc"` |
| Auth failed | `Error: Authentication failed. Check that your PAT is valid and has the "Work Items (Read & Write)" scope.` |
| Permission denied | `Error: Access denied. Your PAT may lack write permissions for project "X".` |
| Not found | `Error: Work item 123 not found in org/project.` |
| Bad request (400) | `Error: Update rejected: <server message>` |
| Network error | `Error: Could not connect to Azure DevOps. Check your network connection.` |
| Missing org/project | `Error: --org and --project must both be provided, or both omitted.` |
