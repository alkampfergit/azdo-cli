# Feature Specification: Work Item Attachment Create/Delete

**Feature Branch**: `036-workitem-attachment-crud`
**Created**: 2026-08-27
**Status**: Draft
**Input**: User description: "Add the ability to create (upload) and delete attachments on an Azure DevOps work item via the azdo CLI. Azdo-cli currently supports retrieving/downloading attachments from a work item, but there is no documented or discoverable command to add a new attachment to a work item or to remove an existing attachment from a work item. This should follow the same command-surface conventions as the existing work-item attachment retrieval command(s)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Attach a file to a work item (Priority: P1)

As an azdo-cli user, I want to attach a local file to an existing work item, so I can share supporting evidence (logs, screenshots, documents) directly on the item without switching to the Azure DevOps web UI.

**Why this priority**: This is the primary capability the issue asks for and unblocks the most common use case (evidence attached during triage or review). Without it, users must leave the CLI entirely to add attachments.

**Independent Test**: Can be fully tested by running the CLI command against a real work item with a local file path and confirming the attachment appears when the work item is subsequently viewed (e.g. via the existing get-item / download-attachment surface).

**Acceptance Scenarios**:

1. **Given** an existing work item and a local file that exists on disk, **When** the user runs the attach command with the work item ID and the file path, **Then** the file is uploaded and linked to the work item, and the CLI reports the attached file's name and size.
2. **Given** an existing work item, **When** the user runs the attach command with a file path that does not exist locally, **Then** the CLI reports a clear error before attempting any network call and makes no change to the work item.
3. **Given** a work item ID that does not exist (or the user lacks access), **When** the user runs the attach command, **Then** the CLI reports a clear error identifying the work item problem and uploads nothing.

---

### User Story 2 - Remove an attachment from a work item (Priority: P2)

As an azdo-cli user, I want to remove a specific attachment from a work item, so I can clean up outdated, incorrect, or sensitive files without leaving the CLI.

**Why this priority**: Cleanup is less frequent than attaching but is the natural complement — without it, attachments added via User Story 1 (or the UI) can only be removed by switching to the web UI.

**Independent Test**: Can be fully tested by attaching a known file to a work item, running the delete command referencing that file's name, and confirming it no longer appears among the work item's attachments.

**Acceptance Scenarios**:

1. **Given** a work item with a named attachment, **When** the user runs the delete command with the work item ID and the attachment's filename, **Then** the attachment is removed from the work item and the CLI confirms the removal.
2. **Given** a work item with no attachment matching the given filename, **When** the user runs the delete command, **Then** the CLI reports a clear "not found" error and makes no change.
3. **Given** a work item ID that does not exist (or the user lacks access), **When** the user runs the delete command, **Then** the CLI reports a clear error identifying the work item problem.

---

### User Story 3 - Discover the new commands (Priority: P3)

As an azdo-cli user, I want the attach and delete commands to show up in the CLI's own help output and documentation, so I don't have to guess whether the capability exists (this is the exact gap the source issue reported for the existing download command).

**Why this priority**: Lower priority than the commands existing at all, but directly addresses the reported pain point ("is not well documented... I missed it"). A command that works but isn't discoverable reproduces the same complaint.

**Independent Test**: Can be fully tested by running the CLI's top-level help and the new commands' own `--help` output and confirming both are listed with a clear one-line description.

**Acceptance Scenarios**:

1. **Given** the CLI is installed, **When** the user runs the top-level help, **Then** the attach and delete attachment commands are listed alongside the existing download-attachment command.
2. **Given** the CLI is installed, **When** the user runs `--help` on either new command, **Then** usage, arguments, and options are described clearly enough to use the command without reading source code.

---

### Edge Cases

- What happens when the local file path for the attach command points to a directory instead of a file? → CLI reports a clear error and uploads nothing.
- What happens when a work item already has multiple attachments with the same filename? → The delete command acts on the same match Azure DevOps returns first for that name (consistent with how the existing download command resolves a filename), and the CLI's confirmation names exactly which attachment (by size/date, if distinguishable) was removed when more than one candidate existed.
- What happens when the upload is interrupted or the server rejects the file (e.g. exceeds the organization's attachment size limit)? → The CLI surfaces the server's error message; the work item is left unchanged (no partial/orphaned attachment reference).
- What happens when the user is authenticated but lacks permission to edit the work item? → The CLI reports a clear permission error, distinct from a "not found" error.
- What happens when the same file is attached twice under different names? → Each attach call is independent; the CLI does not attempt to detect or block duplicate content.

## Assumptions

- Attaching a file always uploads from a local file path on the machine running the CLI (matching the existing download command's local-file symmetry); attaching directly from a URL or stdin is out of scope for this feature.
- When multiple attachments on a work item share the same filename, the delete command resolves the same single match the platform returns first for that name, consistent with how the existing download command already resolves a filename to one attachment.
- No client-side maximum file size is enforced beyond what the platform itself rejects; the CLI surfaces the platform's own error rather than inventing a separate limit.
- Removing an attachment is a normal (non-interactive) CLI operation like the existing download command — it does not require an extra confirmation prompt or a `--yes` flag, since it only affects work item attachments (not the source file, which is untouched) and is not a bulk/irreversible-at-scale action.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to attach a local file to an existing work item by specifying the work item ID and the local file path.
- **FR-002**: System MUST report the attached file's name and size on a successful attach.
- **FR-003**: System MUST reject an attach attempt when the given local file path does not exist or is not a readable file, with a clear error, before making any network call.
- **FR-004**: Users MUST be able to remove a specific attachment from a work item by specifying the work item ID and the attachment's filename.
- **FR-005**: System MUST confirm successful removal, including the removed attachment's name.
- **FR-006**: System MUST report a clear "attachment not found" error (and make no change) when no attachment with the given filename exists on the specified work item.
- **FR-007**: System MUST report a clear error, distinguishing "work item not found" from "permission denied," when the target work item cannot be resolved or modified.
- **FR-008**: The new attach and delete commands MUST be discoverable through the CLI's standard top-level and per-command `--help` output, matching the existing download-attachment command's presentation.
- **FR-009**: System MUST support the same `--org` / `--project` targeting options already available on the existing work-item attachment command(s), so the new commands work consistently across organizations/projects without extra configuration.

### Key Entities

- **Work Item Attachment**: A file associated with a work item, identified by a filename, size, and a server-assigned reference; created by the attach command and removed by the delete command. Multiple attachments may share the same work item and, in edge cases, the same filename.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can attach a local file to a work item and see it confirmed in a single command invocation, without needing to open the Azure DevOps web UI.
- **SC-002**: A user can remove a named attachment from a work item and see the removal confirmed in a single command invocation, without needing to open the Azure DevOps web UI.
- **SC-003**: A user reading only the CLI's own help output (no external docs, no source reading) can correctly identify that attach/delete-attachment capability exists and how to invoke it.
- **SC-004**: Invalid input (missing local file, unknown work item, unknown attachment name, insufficient permission) always produces a clear, specific error rather than a generic failure or a silent no-op.
