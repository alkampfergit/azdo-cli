# Data Model: Work Item Attachments

## Entities

### WorkItemAttachment

Represents a file attached to a work item.

| Field | Type | Description |
|-------|------|-------------|
| name | string | Original filename of the attachment |
| size | number | File size in bytes |
| url | string | Download URL for the attachment binary |

### WorkItem (modified)

The existing `WorkItem` interface gains an optional `attachments` field.

| Field | Type | Description |
|-------|------|-------------|
| attachments | WorkItemAttachment[] or null | List of attachments, null if none |

## Relationships

- A **WorkItem** has zero or more **WorkItemAttachment** records.
- Attachments are derived from the work item's `relations` array (filtered to `rel: "AttachedFile"`).

## Validation Rules

- `name` is always a non-empty string (provided by the API).
- `size` is a non-negative integer (bytes).
- `url` is a valid Azure DevOps attachment URL.
