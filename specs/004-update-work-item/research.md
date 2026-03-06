# Research: Update Work Item

## R-001: Azure DevOps Work Item Update API

**Decision**: Use the PATCH endpoint `_apis/wit/workitems/{id}` with JSON Patch operations (RFC 6902).

**Rationale**: This is the official REST API for updating work items. It supports setting any field via a uniform JSON Patch format, which maps cleanly to all three commands (set-state, assign, set-field).

**Alternatives considered**:
- Azure DevOps Node.js client library (`azure-devops-node-api`): Adds a heavy dependency. The existing codebase already uses `fetch` directly against the REST API, so staying consistent is simpler and lighter.
- WIQL-based updates: Not applicable; WIQL is query-only.

## R-002: JSON Patch Format for Field Updates

**Decision**: Use `application/json-patch+json` content type with `"op": "add"` operations to set fields and `"op": "add"` with empty string to clear fields.

**Rationale**: The `"add"` operation works for both creating and replacing field values. For clearing identity fields like `System.AssignedTo`, setting the value to an empty string `""` is the documented approach.

**Request body format**:
```json
[
  {
    "op": "add",
    "path": "/fields/System.State",
    "value": "Active"
  }
]
```

**Clearing a field (unassign)**:
```json
[
  {
    "op": "add",
    "path": "/fields/System.AssignedTo",
    "value": ""
  }
]
```

**Alternatives considered**:
- `"op": "replace"`: Requires the field to already have a value; less robust than `"add"`.
- `"op": "remove"`: May not work consistently for all field types.

## R-003: AssignedTo Field Value Format

**Decision**: Accept a plain string (display name or email). Pass it directly as the value in the JSON Patch operation.

**Rationale**: Azure DevOps resolves identity strings server-side. Passing the display name (e.g., `"Jamal Hartnett"`) or email (e.g., `"jamal@example.com"`) both work. No need to resolve identities client-side.

**Alternatives considered**:
- IdentityRef object with displayName/uniqueName: More explicit but unnecessarily complex for a CLI tool where the user types a name.
- Client-side identity search API: Adds an extra round-trip and complexity. Not needed since server-side resolution works.

## R-004: Error Handling for Update Operations

**Decision**: Handle HTTP status codes consistently with the existing `getWorkItem` pattern, plus add handling for 400 (Bad Request) which is new for update operations.

**Rationale**: Update operations can fail with 400 for invalid field values or state transitions, which doesn't occur with GET. The response body contains a descriptive error message from Azure DevOps.

**Error codes**:
| Status | Meaning | CLI Behavior |
|--------|---------|-------------|
| 200 | Success | Display confirmation |
| 400 | Bad Request (invalid field/value/transition) | Display server error message |
| 401 | Unauthorized | Authentication error |
| 403 | Forbidden | Permission denied error |
| 404 | Not Found | Work item not found error |

## R-005: Shared Update Service Function

**Decision**: Add a single `updateWorkItem` function to `azdo-client.ts` that accepts an array of JSON Patch operations. Each command builds its own patch operation(s) and calls this shared function.

**Rationale**: Follows the Single Responsibility principle from the constitution. The update function handles HTTP concerns; command modules handle user interaction and field-specific logic. This avoids duplicating fetch/auth/error-handling code across three commands.

**Alternatives considered**:
- Separate update functions per field: Duplicates HTTP/auth logic, violates DRY.
- Generic "update anything" command only: Doesn't satisfy the spec requirement for dedicated set-state and assign commands.

## R-006: Confirmation Output Format

**Decision**: After a successful update, display the work item ID, field changed, and new value in a format consistent with `get-item` output. Support `--json` flag per constitution requirement.

**Rationale**: Constitution mandates `--json` support where applicable. A simple confirmation line for human output, full response object for JSON output.

**Human output example**:
```
Updated work item 19007: State → Active
```

**JSON output example**:
```json
{"id":19007,"field":"System.State","value":"Active","title":"..."}
```
