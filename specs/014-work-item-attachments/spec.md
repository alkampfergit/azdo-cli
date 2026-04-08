# Feature Specification: Work Item Attachments

**Feature Branch**: `014-work-item-attachments`  
**Created**: 2026-04-08  
**Status**: Draft  
**Input**: User description: "Add work item attachments support: list attachments in get-item output and download-attachment command"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Attachments in Work Item Details (Priority: P1)

As a user retrieving a work item, I want to see the list of attachments associated with it so that I know what files are available without leaving the CLI.

**Why this priority**: Viewing attachments is the foundational capability. Users need to discover what attachments exist before they can download them. This also provides the attachment identifiers needed for the download command.

**Independent Test**: Can be fully tested by running `azdo get-item <id>` on a work item that has attachments and verifying the attachment list appears in the output.

**Acceptance Scenarios**:

1. **Given** a work item with one or more attachments, **When** the user runs `azdo get-item <id>`, **Then** the output includes an "Attachments" section listing each attachment's file name and size.
2. **Given** a work item with no attachments, **When** the user runs `azdo get-item <id>`, **Then** no "Attachments" section appears in the output.
3. **Given** a work item with attachments and the `--short` flag, **When** the user runs `azdo get-item <id> --short`, **Then** the output shows a count of attachments (e.g., "Attachments: 3") rather than the full list.

---

### User Story 2 - Download a Work Item Attachment (Priority: P2)

As a user who has identified an attachment on a work item, I want to download it to my local machine so that I can view or use the file.

**Why this priority**: Downloading is the natural next step after discovering attachments. It completes the attachment workflow and delivers direct value.

**Independent Test**: Can be fully tested by running `azdo download-attachment <work-item-id> <filename>` and verifying the file is saved to the current directory.

**Acceptance Scenarios**:

1. **Given** a work item with an attachment named "design.png", **When** the user runs `azdo download-attachment <id> design.png`, **Then** the file "design.png" is downloaded to the current working directory.
2. **Given** a work item with an attachment named "design.png" and the user specifies `--output /tmp`, **When** the user runs `azdo download-attachment <id> design.png --output /tmp`, **Then** the file is saved to `/tmp/design.png`.
3. **Given** a work item with no attachment matching the given filename, **When** the user runs `azdo download-attachment <id> nonexistent.txt`, **Then** the CLI displays an error message indicating the attachment was not found.
4. **Given** a file with the same name already exists in the target directory, **When** the user runs the download command, **Then** the CLI overwrites the existing file.

---

### Edge Cases

- What happens when the attachment filename contains special characters or spaces? The CLI should handle them and save the file with the original name.
- What happens when the user lacks permission to access the attachment? The CLI should display a clear permission error.
- What happens when the network fails during download? The CLI should display a network error and not leave partial files.
- What happens when a work item has many attachments (e.g., 50+)? The list should display all of them.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `get-item` command MUST display a list of attachments (file name and file size) when the work item has attachments.
- **FR-002**: The `get-item` command with `--short` flag MUST display only the count of attachments.
- **FR-003**: The `get-item` command MUST omit the attachments section when the work item has no attachments.
- **FR-004**: A new `download-attachment` command MUST accept a work item ID and an attachment filename as arguments.
- **FR-005**: The `download-attachment` command MUST download the specified attachment to the current working directory by default.
- **FR-006**: The `download-attachment` command MUST support an `--output` option to specify the target directory.
- **FR-007**: The `download-attachment` command MUST display a clear error when the specified attachment filename is not found on the work item.
- **FR-008**: The `download-attachment` command MUST support `--org` and `--project` options consistent with other commands.

### Key Entities

- **Attachment**: Represents a file attached to a work item. Key attributes: file name, file size, download URL.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can see the list of attachments for any work item that has them, directly in the CLI output.
- **SC-002**: Users can download any attachment from a work item in a single command invocation.
- **SC-003**: The attachment list in `get-item` output includes enough information (filename, size) for users to identify the file they want.
- **SC-004**: Error cases (no attachment found, permission denied, network failure) produce clear, actionable messages.

## Assumptions

- [AUTO] Attachment identification: chose filename-based identification because it is the most intuitive for CLI users. Users will specify which attachment to download by its filename.
- [AUTO] Overwrite behavior: chose to overwrite existing files without prompting because this is consistent with typical CLI tool behavior (e.g., curl, wget) and avoids interactive prompts that break scripting.
- [AUTO] Output format: chose to display attachment info inline in the get-item text output rather than requiring a separate command, because this follows the pattern of showing all relevant work item data together.
- [AUTO] API version: will use the same Azure DevOps REST API version (7.1) already used throughout the project.
