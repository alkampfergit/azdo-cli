# Feature Specification: Update Work Item

**Feature Branch**: `004-update-work-item`
**Created**: 2026-03-06
**Status**: Draft
**Input**: User description: "we need functionalities to update work task, change: state, assigned to with specific commands then a generic command to set a single field"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Change Work Item State (Priority: P1)

As a developer using the CLI, I want to quickly change the state of a work item (e.g., from "New" to "Active" or "Closed") so I can update task progress without opening the browser.

**Why this priority**: Changing state is the most frequent update operation. It directly reflects task progress and is essential for sprint/board management.

**Independent Test**: Can be fully tested by running a single command to change a work item's state and verifying the state is updated on Azure DevOps.

**Acceptance Scenarios**:

1. **Given** a valid work item ID and a valid state name, **When** the user runs `azdo set-state <id> <state>`, **Then** the work item's state is updated and a confirmation message is displayed showing the work item ID, title, and new state.
2. **Given** a valid work item ID and an invalid state name, **When** the user runs `azdo set-state <id> <state>`, **Then** an error message is displayed indicating the state value was rejected by Azure DevOps.
3. **Given** no org/project context available, **When** the user runs the command without `--org` and `--project` flags, **Then** an error message guides the user to provide context.

---

### User Story 2 - Assign Work Item to a User (Priority: P2)

As a team lead, I want to reassign work items to team members from the CLI so I can quickly distribute work during stand-ups or triage sessions.

**Why this priority**: Assignment changes are the second most common update. They enable workflow management without leaving the terminal.

**Independent Test**: Can be fully tested by running a command to assign a work item and verifying the assigned-to field is updated on Azure DevOps.

**Acceptance Scenarios**:

1. **Given** a valid work item ID and a display name, **When** the user runs `azdo assign <id> <name>`, **Then** the work item's "Assigned To" field is updated to the specified user and a confirmation is displayed.
2. **Given** a valid work item ID, **When** the user runs `azdo assign <id> --unassign`, **Then** the work item's "Assigned To" field is cleared and a confirmation is displayed.
3. **Given** a display name that does not match any user in the organization, **When** the user runs the assign command, **Then** Azure DevOps returns an error and a meaningful message is shown to the user.

---

### User Story 3 - Set Any Single Field by Reference Name (Priority: P3)

As a power user, I want a generic command to set any work item field by its reference name so I can update fields that don't have dedicated commands (e.g., iteration path, area path, priority, tags, custom fields).

**Why this priority**: This provides flexibility for all other field updates beyond state and assignment, covering edge cases and custom process templates.

**Independent Test**: Can be fully tested by running a command to set any known field (e.g., `System.Title`) and verifying it is updated on Azure DevOps.

**Acceptance Scenarios**:

1. **Given** a valid work item ID, a valid field reference name, and a value, **When** the user runs `azdo set-field <id> <field-ref-name> <value>`, **Then** the field is updated and a confirmation is displayed showing the work item ID, field name, and new value.
2. **Given** an invalid field reference name, **When** the user runs the set-field command, **Then** an error message is displayed indicating the field was not recognized.
3. **Given** a field reference name and a value that violates field constraints (e.g., setting a numeric field to text), **When** the user runs the command, **Then** an appropriate error from Azure DevOps is displayed.

---

### Edge Cases

- What happens when the user lacks write permissions on the work item? The CLI displays a clear "permission denied" error.
- What happens when the work item is locked or in a state that does not allow the requested transition? The CLI relays the Azure DevOps error message.
- What happens when the network connection fails mid-update? The CLI displays a network error and the work item remains unchanged (the API is atomic).
- What happens when the user provides an empty value for a field? The field is cleared if the field supports empty values; otherwise a validation error from Azure DevOps is displayed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The CLI MUST provide a `set-state` command that accepts a work item ID and a target state string, and updates the work item's state.
- **FR-002**: The CLI MUST provide an `assign` command that accepts a work item ID and a user display name, and updates the work item's assigned-to field.
- **FR-003**: The `assign` command MUST support an `--unassign` flag that clears the assigned-to field.
- **FR-004**: The CLI MUST provide a `set-field` command that accepts a work item ID, a field reference name, and a value, and updates that field.
- **FR-005**: All update commands MUST support `--org` and `--project` flags, consistent with the existing `get-item` command. When omitted, context is resolved from config or git remote.
- **FR-006**: All update commands MUST display a confirmation after a successful update, showing at minimum the work item ID, the field changed, and the new value.
- **FR-007**: All update commands MUST display meaningful error messages for common failure modes: authentication failure, permission denied, work item not found, invalid field/value, and network errors.
- **FR-008**: All update commands MUST use the same authentication mechanism as the existing `get-item` command.

### Key Entities

- **Work Item**: The Azure DevOps work item being updated, identified by its numeric ID. Contains fields such as state, assigned-to, title, area path, iteration path, and custom fields.
- **Field Reference Name**: The Azure DevOps canonical field identifier (e.g., `System.State`, `System.AssignedTo`, `Microsoft.VSTS.Common.Priority`). Used by the generic `set-field` command.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can change a work item's state in a single CLI command, completing the action in under 5 seconds (excluding network latency).
- **SC-002**: Users can reassign or unassign a work item in a single CLI command.
- **SC-003**: Users can update any supported work item field using the generic set-field command without needing to open a browser.
- **SC-004**: All error scenarios (invalid state, unknown user, bad field name, permission denied) produce actionable error messages that help the user correct the issue.
- **SC-005**: The update commands follow the same patterns (authentication, context resolution, flag conventions) as the existing `get-item` command, requiring no additional learning for existing users.

## Assumptions

- State names are passed as-is to the service; the CLI does not validate state names locally. Invalid transitions produce a server-side error that is displayed to the user.
- The `assign` command accepts a user display name as a simple string. Identity resolution happens server-side. If the name is ambiguous or not found, an error is returned.
- The `set-field` command sends the value as a string; type coercion for numeric/date fields happens server-side.
