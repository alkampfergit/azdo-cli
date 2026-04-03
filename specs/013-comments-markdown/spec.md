# Feature Specification: Comments Markdown Support

**Feature Branch**: `013-comments-markdown`  
**Created**: 2026-04-03  
**Status**: Draft  
**Input**: User description: "Add --markdown flag to comments list and add commands to support HTML-to-markdown conversion"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add Markdown Comment (Priority: P1)

A user writing a comment via `azdo comments add` can pass the `--markdown` flag to signal that the comment text is markdown-formatted. The CLI will send the comment so that Azure DevOps stores and renders it as markdown rather than plain text.

**Why this priority**: This is the most common new workflow — contributors write markdown in the terminal and expect Azure DevOps to render it properly.

**Independent Test**: Run `azdo comments add <id> "**bold text**" --markdown` and verify a comment is posted with the markdown content-type signalled to the API.

**Acceptance Scenarios**:

1. **Given** a valid work item ID, **When** `azdo comments add <id> "## Title\nSome text" --markdown` is run, **Then** the comment is created with the text sent as markdown and the CLI confirms success.
2. **Given** the `--markdown` flag is absent, **When** `azdo comments add <id> "## Title"` is run, **Then** the comment is posted with existing plain-text behaviour unchanged.

---

### User Story 2 - List Comments with Markdown Conversion (Priority: P2)

A user running `azdo comments list` with the `--markdown` flag sees all comment bodies rendered as markdown. For HTML-formatted comments the CLI converts them to markdown on the fly; plain text and already-markdown comments are passed through unchanged.

**Why this priority**: Users need a consistent, readable markdown view of all comments regardless of how they were originally authored (HTML legacy vs. markdown new).

**Independent Test**: Run `azdo comments list <id> --markdown` against a work item that has at least one HTML comment. Verify the output contains converted markdown rather than raw HTML tags.

**Acceptance Scenarios**:

1. **Given** a work item with HTML comments, **When** `azdo comments list <id> --markdown` is run, **Then** each HTML comment body is converted to markdown before display.
2. **Given** a work item with plain-text or already-markdown comments, **When** `azdo comments list <id> --markdown` is run, **Then** comment bodies are displayed as-is (no double-conversion).
3. **Given** the `--markdown` flag is absent, **When** `azdo comments list <id>` is run, **Then** comment bodies are displayed exactly as returned by the API (existing behaviour unchanged).

---

### Edge Cases

- What happens when `--markdown` is used together with `--json`? The raw API text is returned in JSON (no conversion); `--markdown` applies to human-readable output only.
- What if the comment text is empty or whitespace-only for `add`? The existing empty-text guard still fires before any API call.
- What if HTML-to-markdown conversion produces an empty string for a comment? The converted (empty) string is displayed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `comments add` command MUST accept an optional `--markdown` flag.
- **FR-002**: When `--markdown` is passed to `comments add`, the comment text MUST be sent to the API with a markdown format indicator so Azure DevOps renders it as markdown.
- **FR-003**: When `--markdown` is absent from `comments add`, the existing plain-text posting behaviour MUST be preserved.
- **FR-004**: The `comments list` command MUST accept an optional `--markdown` flag.
- **FR-005**: When `--markdown` is passed to `comments list`, each comment body detected as HTML MUST be converted to markdown before display.
- **FR-006**: When `--markdown` is passed to `comments list` and a comment body is NOT HTML, it MUST be displayed unchanged.
- **FR-007**: When `--markdown` is absent from `comments list`, comment bodies MUST be displayed exactly as returned by the API.
- **FR-008**: The `--markdown` flag MUST NOT affect `--json` output; JSON output MUST always return raw API text.

### Key Entities

- **WorkItemComment**: Existing entity; `text` field holds the raw comment body (HTML or markdown or plain text).
- **Markdown flag**: A boolean CLI option controlling display (list) and submission format (add).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can post a markdown-formatted comment in a single command with `--markdown` and have it render correctly in Azure DevOps.
- **SC-002**: Users can read all comments in a consistent markdown format by passing `--markdown` to `comments list`, regardless of each comment's original format.
- **SC-003**: All existing comment tests continue to pass — no regression in current behaviour.
- **SC-004**: New tests cover the `--markdown` flag for both `add` (markdown format sent to API) and `list` (HTML-to-markdown and passthrough paths).

## Assumptions

- [AUTO] Azure DevOps API markdown format: the REST API for adding comments accepts a `format` field in the request body. We set `format: "markdown"` when `--markdown` is passed, matching the AzDO `7.1-preview.4` Comments API. **Rationale**: this is the standard way to tell AzDO to store and render the comment as markdown.
- [AUTO] `--markdown` + `--json`: JSON output returns raw API data; the markdown flag is ignored for JSON output. **Rationale**: consistent with how `--json` works in every other command — raw data, no display transforms.
- [AUTO] HTML detection for list: reuse the existing `isHtml()` utility from `src/services/html-detect.ts`. **Rationale**: avoids duplicating detection logic; the utility is already exercised by get-md-field and get-item commands.
- [AUTO] Markdown conversion for list: reuse the existing `toMarkdown()` utility from `src/services/md-convert.ts`. **Rationale**: consistent with how `get-md-field` and `get-item --markdown` work.
