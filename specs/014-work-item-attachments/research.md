# Research: Work Item Attachments

## Azure DevOps Work Item Relations API

### Decision: Use `$expand=relations` on existing work item endpoint
**Rationale**: The Azure DevOps REST API exposes attachments as work item relations with `rel: "AttachedFile"`. By adding `$expand=relations` to the existing `getWorkItem` call, we get attachment metadata without an extra API call.
**Alternatives considered**:
- Separate attachments API endpoint: Would require an additional HTTP request per work item. Not needed since relations expand provides all metadata.

### Decision: Use the attachment URL from relations for download
**Rationale**: Each `AttachedFile` relation includes a `url` field pointing to `/_apis/wit/attachments/{guid}`. This URL can be fetched directly with the same PAT authentication to get the binary content.
**Alternatives considered**:
- Constructing the URL manually from attachment ID: Unnecessary since the full URL is provided in the relation.

### Decision: Use `node:fs/promises` writeFile for saving
**Rationale**: Native Node.js API, no dependencies. `response.arrayBuffer()` + `Buffer.from()` + `fs.writeFile()` handles binary content correctly.
**Alternatives considered**:
- Streaming with `pipeline`: Overkill for typical attachment sizes. Simpler approach is sufficient.

### Decision: Match attachments by filename
**Rationale**: Filenames are the most user-friendly identifier. The Azure DevOps UI also identifies attachments by filename.
**Alternatives considered**:
- Match by attachment GUID: Not user-friendly, requires users to know internal IDs.
- Match by index: Fragile, order may change.

## Azure DevOps API Response Shape

### Work Item with Relations

```json
{
  "id": 42,
  "rev": 1,
  "fields": { ... },
  "relations": [
    {
      "rel": "AttachedFile",
      "url": "https://dev.azure.com/{org}/_apis/wit/attachments/{guid}",
      "attributes": {
        "authorizedDate": "2026-01-15T10:30:00Z",
        "id": 12345,
        "resourceCreatedDate": "2026-01-15T10:30:00Z",
        "resourceModifiedDate": "2026-01-15T10:30:00Z",
        "revisedDate": "9999-01-01T00:00:00Z",
        "resourceSize": 102400,
        "name": "design.png",
        "comment": "Optional comment"
      }
    }
  ],
  "_links": { ... }
}
```

### Key fields from relation attributes:
- `name`: The original filename
- `resourceSize`: File size in bytes
- `url` (on the relation object): Direct download URL for the attachment

## Autonomous Decisions

- [AUTO] No separate list-attachments command: Attachments are shown inline in get-item output, consistent with how description and other fields are displayed. A separate command would violate simplicity principle.
- [AUTO] Binary download via arrayBuffer: Using `response.arrayBuffer()` rather than streaming since work item attachments are typically small files (documents, screenshots). This keeps the code simple.
- [AUTO] No progress bar: CLI simplicity principle — avoid adding complexity for a feature that completes quickly for typical attachment sizes.
