# Data Model: Update Work Item

## Entities

### JsonPatchOperation

Represents a single JSON Patch operation sent to the Azure DevOps API.

| Field | Type | Description |
|-------|------|-------------|
| op | string | Operation type: `"add"`, `"remove"`, `"replace"`, `"test"` |
| path | string | JSON pointer to the target field, e.g., `/fields/System.State` |
| value | string or null | The new value for the field (omitted for `"remove"`) |

### UpdateResult

Represents the outcome of a successful work item update, returned to the command layer for display.

| Field | Type | Description |
|-------|------|-------------|
| id | number | Work item ID |
| rev | number | New revision number after update |
| title | string | Work item title (for confirmation display) |
| fieldName | string | The field reference name that was changed |
| fieldValue | string or null | The new value (null if cleared) |

### Existing Entities (unchanged)

- **WorkItem** (`src/types/work-item.ts`): Already defined. The update API returns the same shape; no changes needed.
- **AzdoContext** (`src/types/work-item.ts`): Already defined. Reused by all update commands for org/project resolution.
- **AuthCredential** (`src/types/work-item.ts`): Already defined. Reused for PAT resolution.

## State Transitions

Work item state transitions are governed by the Azure DevOps process template (Agile, Scrum, CMMI, or custom). The CLI does not enforce or validate state transitions locally. Invalid transitions result in a 400 error from the API with a descriptive message.

## Relationships

```
Command (set-state | assign | set-field)
  └── builds JsonPatchOperation[]
        └── passed to updateWorkItem(context, id, pat, operations)
              └── returns UpdateResult
```
