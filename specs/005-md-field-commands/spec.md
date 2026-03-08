# Feature Specification: Markdown Field Commands

**Feature Branch**: `005-md-field-commands`
**Created**: 2026-03-06
**Status**: Draft
**Input**: User description: "A couple of special functions, set-md-field and get-md-field to get a specific field and set a specific field in markdown, the feature of get should check if the return value is really markdown or html if html convert in markdown, but when you set the field you need to be sure to set field type as markdown. You can specify markdown inline with quotation syntax or specifying a markdown file on disk"

## Clarifications

### Session 2026-03-06

- Q: Should `set-md-field` and `get-md-field` be separate top-level commands, extensions of existing commands (`set-field --markdown`), or a subcommand group (`azdo markdown set/get`)? → A: Separate top-level commands (`set-md-field` and `get-md-field`), consistent with the existing single-responsibility command pattern.
- Q: Should `set-md-field` support reading from stdin (piping), and if so, via explicit flag or auto-detection? → A: Support stdin with auto-detection — when no inline content argument and no `--file` option is provided, the command automatically reads from stdin.
- Q: Should `get-md-field` support a `--json` flag for structured output (consistent with other CLI commands)? → A: No, raw markdown output only. The command outputs plain markdown to stdout, optimized for readability and piping to files.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Retrieve a Markdown Field from a Work Item (Priority: P1)

A user wants to read a specific field from an Azure DevOps work item that contains rich text (markdown or HTML). The user runs `get-md-field` specifying the work item ID and field name. The system retrieves the field value, detects whether the content is HTML or markdown, and if HTML, converts it to clean markdown before displaying the result. This ensures the user always receives consistent, readable markdown output regardless of how Azure DevOps stores the field internally.

**Why this priority**: Reading field content is the most fundamental operation and serves as the foundation for verifying that set operations work correctly. Without reliable retrieval with format normalization, the entire feature has limited value.

**Independent Test**: Can be fully tested by running the get command against any existing work item with a rich-text field (e.g., Description) and verifying the output is valid markdown.

**Acceptance Scenarios**:

1. **Given** a work item with a Description field stored as HTML, **When** the user runs `get-md-field <workItemId> <fieldName>`, **Then** the output is valid markdown converted from the HTML content.
2. **Given** a work item with a Description field already stored as markdown, **When** the user runs `get-md-field <workItemId> <fieldName>`, **Then** the output is the original markdown content unchanged.
3. **Given** a work item with a field that contains plain text (no HTML tags, no markdown formatting), **When** the user runs `get-md-field <workItemId> <fieldName>`, **Then** the output is the plain text as-is.

---

### User Story 2 - Set a Markdown Field Using Inline Content (Priority: P1)

A user wants to update a specific field on an Azure DevOps work item with markdown content provided directly on the command line. The user runs `set-md-field` with the work item ID, field name, and inline markdown content enclosed in quotes. The system sends the content to Azure DevOps, ensuring the field type is set as markdown so the content renders correctly in the Azure DevOps web UI.

**Why this priority**: Setting fields inline is the most common and fastest workflow for quick updates. Combined with P1 get, this completes the core read-write loop.

**Independent Test**: Can be tested by setting a field with inline markdown and then verifying the content appears correctly in the Azure DevOps web UI or via `get-md-field`.

**Acceptance Scenarios**:

1. **Given** a valid work item ID and field name, **When** the user runs `set-md-field <workItemId> <fieldName> "# Heading\n\nSome **bold** text"`, **Then** the field is updated with the markdown content and the field type is set to indicate markdown format.
2. **Given** a valid work item ID and field name, **When** the user runs `set-md-field` with inline markdown containing special characters (backticks, pipes, brackets), **Then** all special characters are preserved correctly in the stored content.
3. **Given** an invalid work item ID, **When** the user runs `set-md-field`, **Then** a clear error message is displayed indicating the work item was not found.

---

### User Story 3 - Set a Markdown Field from a File (Priority: P2)

A user has a markdown file on disk (e.g., a detailed description, release notes, or acceptance criteria) and wants to upload its content to a work item field. The user runs `set-md-field` specifying a file path instead of inline content. The system reads the file, validates it exists and is readable, and sends its content to Azure DevOps with the field type set as markdown.

**Why this priority**: File-based input supports longer, more complex content and integrates with existing documentation workflows. It builds on the inline set capability.

**Independent Test**: Can be tested by creating a markdown file, running the set command with the file path, and verifying the full file content appears in the work item field.

**Acceptance Scenarios**:

1. **Given** a valid markdown file on disk, **When** the user runs `set-md-field <workItemId> <fieldName> --file <path/to/file.md>`, **Then** the file's full content is uploaded to the specified field with markdown format.
2. **Given** a file path that does not exist, **When** the user runs `set-md-field` with `--file`, **Then** a clear error message is displayed indicating the file was not found.
3. **Given** a large markdown file (e.g., 50KB+), **When** the user runs `set-md-field` with `--file`, **Then** the full content is uploaded without truncation.

---

### User Story 4 - Set a Markdown Field from Stdin (Priority: P2)

A user generates markdown content from another tool or script and wants to pipe it directly into a work item field. The user runs a pipeline like `cat notes.md | azdo set-md-field <workItemId> <fieldName>` or `generate-report | azdo set-md-field <workItemId> System.Description`. When no inline content argument and no `--file` option is provided, the command automatically reads from stdin.

**Why this priority**: Stdin support enables composability with other CLI tools, a standard Unix pattern. It builds on the same content-setting logic as inline and file modes.

**Independent Test**: Can be tested by piping markdown content from another command into `set-md-field` and verifying the field is updated correctly.

**Acceptance Scenarios**:

1. **Given** markdown content piped via stdin, **When** the user runs `echo "# Title" | azdo set-md-field <workItemId> <fieldName>`, **Then** the field is updated with the piped markdown content.
2. **Given** no inline content, no `--file`, and no stdin input (interactive terminal with no pipe), **When** the user runs `set-md-field <workItemId> <fieldName>`, **Then** the command displays a clear error message explaining that content must be provided via inline argument, `--file`, or stdin pipe.

---

### Edge Cases

- What happens when the field name does not exist on the work item type? The system displays a clear error message listing the invalid field name.
- What happens when the field is read-only (e.g., system fields like "Created Date")? The system displays an error indicating the field cannot be modified.
- What happens when the HTML content contains malformed or unclosed tags? The converter handles it gracefully, producing best-effort markdown output.
- What happens when the user provides both inline content and `--file`? The system rejects the command with an error explaining that only one content source may be specified.
- What happens when the user provides inline content and also pipes stdin? The inline content takes precedence; stdin is ignored.
- What happens when the user provides `--file` and also pipes stdin? The `--file` content takes precedence; stdin is ignored.
- What happens when the markdown file is empty? The system sets the field to an empty value (clearing it).
- What happens when the field contains mixed HTML and markdown? The system detects the HTML portions and converts the entire content to markdown.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The CLI MUST provide a `get-md-field` top-level command that retrieves a specific field value from an Azure DevOps work item by work item ID and field name.
- **FR-002**: The `get-md-field` command MUST detect whether the returned field content is HTML or markdown.
- **FR-003**: When the returned content is HTML, `get-md-field` MUST convert it to equivalent markdown before outputting.
- **FR-004**: When the returned content is already markdown or plain text, `get-md-field` MUST output it unchanged.
- **FR-005**: The CLI MUST provide a `set-md-field` top-level command that updates a specific field on an Azure DevOps work item.
- **FR-006**: The `set-md-field` command MUST support inline markdown content provided as a quoted string argument.
- **FR-007**: The `set-md-field` command MUST support reading markdown content from a file on disk via a `--file` option.
- **FR-008**: The `set-md-field` command MUST reject commands that specify multiple content sources (inline + `--file`), with a clear error message.
- **FR-009**: When setting a field, the system MUST ensure the field type is explicitly set to markdown format so the content renders correctly in Azure DevOps.
- **FR-010**: Both commands MUST validate that the specified work item ID exists and the field name is valid, providing clear error messages on failure.
- **FR-011**: The `set-md-field` command MUST validate that the specified file exists and is readable before attempting to send content.
- **FR-012**: The `set-md-field` command MUST auto-detect and read from stdin when no inline content argument and no `--file` option is provided, enabling pipeline composability.
- **FR-013**: When no content is available from any source (no inline, no `--file`, no stdin pipe), `set-md-field` MUST display a clear error message explaining the available content input methods.
- **FR-014**: When inline content is provided, it MUST take precedence over stdin; when `--file` is provided, it MUST take precedence over stdin.
- **FR-015**: The `get-md-field` command MUST output raw markdown text to stdout with no JSON envelope or additional metadata, suitable for direct piping to files or other tools.
- **FR-016**: The `set-md-field` command MUST support a `--json` flag that outputs the update result as a JSON object (containing work item ID, revision, field name, and value), consistent with the existing `set-field` command and Constitution Principle I.

### Key Entities

- **Work Item Field**: A named attribute on an Azure DevOps work item that can hold rich text content. Key attributes: field name (reference name or friendly name), field value (content), and content format (HTML or markdown).
- **Markdown Content Source**: The origin of markdown content for a set operation - an inline string provided on the command line, a file path via `--file`, or content piped through stdin. Precedence order: inline > `--file` > stdin.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can retrieve any rich-text field from a work item and receive valid markdown output in a single command invocation.
- **SC-002**: Users can update a work item field with markdown content (inline, from file, or piped via stdin) in a single command invocation, and the content renders correctly as formatted text in the Azure DevOps web interface.
- **SC-003**: HTML-to-markdown conversion preserves all meaningful content elements (headings, lists, bold, italic, links, code blocks, tables) with no data loss.
- **SC-004**: 100% of invalid inputs (bad work item ID, missing file, invalid field name, conflicting options, missing content) produce actionable error messages that guide the user to correct the issue.

## Assumptions

- The Azure DevOps REST API supports setting fields with an explicit markdown content type. If the API only accepts HTML for rich-text fields, the system will need to convert markdown to HTML before sending (this would be an implementation detail, not a spec change).
- Field names can be specified using either the friendly display name (e.g., "Description") or the reference name (e.g., "System.Description"), consistent with existing CLI behavior.
- Authentication and organization/project context are already configured via existing CLI settings (from features 002 and 003).
- The HTML-to-markdown conversion handles common Azure DevOps HTML patterns (div, span, br, table, etc.) but does not need to handle arbitrary complex HTML from external sources.
