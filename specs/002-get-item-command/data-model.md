# Data Model: Get Work Item Command

**Feature**: 002-get-item-command | **Date**: 2026-03-05

## Entities

### WorkItem

Represents an Azure DevOps work item retrieved from the API.

| Field | Type | Source API Field | Description |
|-------|------|-----------------|-------------|
| id | number | `id` | Unique work item identifier |
| rev | number | `rev` | Revision number |
| title | string | `fields.System.Title` | Work item title |
| state | string | `fields.System.State` | Current state (New, Active, Closed, etc.) |
| type | string | `fields.System.WorkItemType` | Type (Bug, Task, User Story, etc.) |
| assignedTo | string \| null | `fields.System.AssignedTo.displayName` | Display name of assignee, null if unassigned |
| description | string \| null | `fields.System.Description` | HTML description, null if empty |
| areaPath | string | `fields.System.AreaPath` | Area path |
| iterationPath | string | `fields.System.IterationPath` | Iteration path |
| url | string | `_links.html.href` | Web URL to view the work item in browser |

### AzdoContext

Represents the resolved Azure DevOps organization and project context.

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| org | string | CLI flag or git remote | Azure DevOps organization name |
| project | string | CLI flag or git remote | Team project name |

### AuthCredential

Represents the resolved authentication credential.

| Field | Type | Description |
|-------|------|-------------|
| pat | string | Personal Access Token value |
| source | 'env' \| 'credential-store' \| 'prompt' | Where the PAT was resolved from |

## Relationships

```
AuthCredential --[authenticates]--> AzdoContext --[scopes]--> WorkItem
```

- An `AuthCredential` is required to access any `WorkItem`.
- An `AzdoContext` (org + project) scopes which work items are accessible.
- A `WorkItem` is uniquely identified by `id` within an `AzdoContext`.

## State Transitions

No state mutations in this feature. All operations are read-only (GET).

## Validation Rules

- `WorkItem.id`: Must be a positive integer (validated before API call).
- `AzdoContext.org`: Non-empty string. Must not contain path separators.
- `AzdoContext.project`: Non-empty string. Must not contain path separators.
- `AuthCredential.pat`: Non-empty string. Validated by API response (401 = invalid).
