# Feature Specification: Delete Work Items

**Feature Branch**: `feature/059-delete-work-items`
**Created**: 2026-10-29
**Status**: Draft
**Input**: User description: "I want to delete work items". User decisions: use the Recycle Bin only; accept one or more explicit work item IDs.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Delete selected work items (Priority: P1)

As a project contributor, I want to move one or more unwanted work items to the Recycle Bin in one command. This lets me remove duplicate or incorrect items without opening each item in the browser.

**Why this priority**: Deletion of selected items is the main user need.

**Independent Test**: Create two disposable work items. Delete both by ID. Check that both are in the Recycle Bin and that an unrelated item is unchanged. Repeat with one item.

**Acceptance Scenarios**:

1. **Given** an active item and permission to delete it, **When** the user requests deletion by ID and confirms, **Then** the item moves to the Recycle Bin and the result identifies that ID as deleted.
2. **Given** three active items, **When** the user selects two IDs and confirms, **Then** only those two items move to the Recycle Bin and each has a result.
3. **Given** a selected parent item with a linked child, **When** the user deletes only the parent, **Then** the command does not request deletion of the child.
4. **Given** repeated IDs, **When** the user confirms deletion, **Then** each distinct ID is processed once and has one result in first-occurrence order.

---

### User Story 2 - Control deletion in a terminal or script (Priority: P2)

As a user, I want to check the selected IDs before deletion. As a script author, I want to give explicit confirmation without a prompt.

**Why this priority**: Explicit confirmation reduces selection errors and permits unattended use.

**Independent Test**: Decline the terminal prompt and check that no item changes. Run with explicit confirmation and structured output from a script. Check that no prompt occurs.

**Acceptance Scenarios**:

1. **Given** an interactive terminal without explicit confirmation, **When** the command starts, **Then** it shows the resolved organization, project, distinct IDs, item count, and Recycle Bin destination before asking for confirmation. An empty answer declines.
2. **Given** a confirmation prompt, **When** the user declines or input ends, **Then** no deletion is requested, the command reports cancellation, and it exits successfully.
3. **Given** input without an interactive terminal and without explicit confirmation, **When** the command starts, **Then** it fails before deletion and explains how to supply confirmation.
4. **Given** explicit confirmation and structured output, **When** deletion completes, **Then** standard output contains one valid JSON result document and no prompt text.

---

### User Story 3 - Understand incomplete deletion (Priority: P2)

As a user, I want a result for each selected item so that I can distinguish successful deletions from failures and uncertain results.

**Why this priority**: A group of selected items can include items that cannot be deleted.

**Independent Test**: Request deletion of an allowed item, a missing item, and an item for which deletion is denied. Check each result and the failure exit status.

**Acceptance Scenarios**:

1. **Given** a mix of valid, missing, and forbidden IDs, **When** deletion runs, **Then** the command attempts the other items after an item-specific rejection, reports each result, and exits with a non-zero status.
2. **Given** an item already in the Recycle Bin, **When** it is selected, **Then** the command reports a failure for that ID and does not claim a new deletion.
3. **Given** a request with an uncertain outcome because the connection was lost, **When** the command reports results, **Then** it marks the affected outcome as unknown, exits with a non-zero status, and does not report an unconfirmed success.
4. **Given** missing authentication or a failure that prevents further processing, **When** the command stops, **Then** it reports confirmed results and marks each remaining ID as not attempted.

### Edge Cases

- No IDs, zero, negative numbers, non-integer values, or values outside the supported work item ID range: reject the whole input before deletion.
- One invalid ID mixed with valid IDs: reject the whole input before deletion.
- An ID from another project: reject it for the resolved project; do not silently switch projects.
- Duplicate IDs: process each distinct ID once, in first-occurrence order.
- An item is deleted by another user before processing: report the service rejection for that item.
- A large selection: report one result per distinct ID without silently truncating the selection. Any input limit must be stated and checked before deletion.
- Some deletions succeed before a later failure: preserve the successful results; do not claim rollback.
- A lost connection: distinguish an unknown outcome from a confirmed failure or an item not attempted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The CLI MUST accept one or more explicit work item IDs in one deletion command. It MUST validate all IDs before requesting deletion. Invalid input MUST produce a non-zero exit status and no deletions.
- **FR-002**: The command MUST use the existing organization, project, and authentication settings and overrides. Each selected item MUST belong to the resolved project. The command MUST NOT silently change project context.
- **FR-003**: The command MUST move selected items to the Recycle Bin only. It MUST NOT offer or request permanent deletion.
- **FR-004**: The command MUST process each distinct ID once, in first-occurrence order. It MUST NOT select extra items from queries, parent-child relationships, or other links.
- **FR-005**: Without explicit confirmation, the command MUST ask for confirmation in an interactive terminal. The prompt MUST show the resolved organization, project, IDs, count, and Recycle Bin destination. A declined or empty answer, or end of input, MUST cancel deletion and return exit status zero.
- **FR-006**: The command MUST accept explicit confirmation through `--yes`. Without an interactive terminal, it MUST require this option and fail before deletion if it is absent. JSON output MUST NOT imply confirmation.
- **FR-007**: The command MUST provide readable output and JSON output through `--json`. Both forms MUST identify the organization, project, and one outcome per distinct ID: deleted, failed, unknown, or not attempted. Failed outcomes MUST include a reason. Unknown and not-attempted outcomes MUST explain the cause.
- **FR-008**: JSON mode MUST write one valid result document to standard output. Prompts and diagnostic text MUST go to standard error. Normal output MUST omit credentials.
- **FR-009**: The command MUST continue after an item-specific rejection. If a shared authentication, service, or connection failure prevents further processing, it MUST retain confirmed results and mark remaining IDs as not attempted. It MUST mark an unconfirmed deletion outcome as unknown.
- **FR-010**: The command MUST return exit status zero only when all selected items were confirmed deleted or the user cancelled before deletion. Invalid input, missing confirmation in unattended use, or any failed, unknown, or not-attempted result MUST return a non-zero status.
- **FR-011**: The command MUST treat a missing or already-deleted item as a failed outcome. It MUST NOT report that the current command deleted that item.
- **FR-012**: Help and user documentation MUST describe ID selection, confirmation, JSON output, partial failure, and the Recycle Bin destination. They MUST include examples for one ID, multiple IDs, and unattended use.

### Key Entities

- **Work item**: An item identified by an ID in an Azure DevOps organization and project. Successful deletion moves it to the Recycle Bin.
- **Deletion selection**: The explicit IDs supplied by the user, reduced to distinct IDs in first-occurrence order, within one organization and project.
- **Deletion result**: The organization, project, per-ID outcome and reason, and total number of items in each outcome category.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In acceptance tests, users can delete either one item or a selection of ten allowed items in one command invocation and at most one confirmation prompt.
- **SC-002**: In all successful acceptance tests, 100% of selected items are present in the Recycle Bin and zero unselected items are deleted.
- **SC-003**: Invalid-input, declined-confirmation, and missing-confirmation tests cause zero deletions.
- **SC-004**: Every mixed-result and connection-failure test reports exactly one outcome per distinct ID and reports zero unconfirmed successes.
- **SC-005**: Every unattended acceptance test completes without a prompt and produces a valid structured result that identifies all failed or uncertain IDs for follow-up.

## Assumptions and Dependencies

- The user selected recoverable deletion only and confirmed support for one or more explicit IDs.
- Confirmation and `--yes` follow the existing attachment deletion policy. Duplicate handling and failure behavior are specification defaults.
- Restore, Recycle Bin browsing, permanent deletion, query-based selection, input files, and automatic deletion of related items are outside scope.
- Users supply existing credentials and must have permission to delete work items. This feature does not change permissions.
- Azure DevOps controls Recycle Bin retention and restoration. This feature does not promise indefinite recovery or restore items.
- Multiple deletions are not a single all-or-nothing operation. Successful deletions are not rolled back after another item fails.
- Transport selection, service limits, and checks that enforce project membership belong to planning. See the [grounding report](../../.specify/ado-ground/grounding-report.md).
