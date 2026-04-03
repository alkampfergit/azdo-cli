# Feature Specification: Fix Markdown Field Formatting in Get Item Output

**Feature Branch**: `012-fix-markdown-field-formatting`  
**Created**: 2026-04-03  
**Status**: Draft  
**Input**: User description: "For all markdown content of get item we have output not formatted. The output contains the name of the field then immediately, without even a space the content in markdown. For all markdown content the tool must append a ':' char at the end of the name of the field, then a space and the content if the content is oneline, but if the content is multiline markdown it must start on new line"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Single-Line Markdown Field Display (Priority: P1)

As a developer using the get-item command with markdown enabled, when a field contains single-line markdown content (e.g., a short tag or plain-text value), the output should show the field label followed by a colon, a space, and then the content on the same line.

**Why this priority**: This is the core formatting bug affecting the readability of all markdown-enabled output. Without a separator between label and content, the output is unreadable.

**Independent Test**: Can be fully tested by running `get-item` with `--markdown` on a work item with a short single-line extra field, and verifying the label and content are separated by `: `.

**Acceptance Scenarios**:

1. **Given** a work item with a single-line extra field value, **When** `get-item --markdown` is run, **Then** the output shows `FieldName: value` with a colon-space separator.
2. **Given** a work item with a single-line description, **When** `get-item --short --markdown` is run, **Then** the description line reads `Description: <content>` with colon and space.

---

### User Story 2 - Multi-Line Markdown Field Display (Priority: P2)

As a developer using the get-item command with markdown enabled, when a field contains multi-line markdown content (e.g., a description with headers, lists, or paragraphs), the output should show the field label followed by a colon on one line, with the markdown content starting on the next line.

**Why this priority**: Multi-line markdown content placed directly after a field label on the same line makes the output unreadable. The content must start on a new line to preserve markdown structure.

**Independent Test**: Can be fully tested by running `get-item --markdown` on a work item whose description contains headings or lists, and verifying the content starts on the line after the label.

**Acceptance Scenarios**:

1. **Given** a work item with a multi-line HTML description, **When** `get-item --markdown` is run, **Then** the output shows `Description:` on one line and the markdown content starting on the next line.
2. **Given** a work item with a multi-line extra field value, **When** `get-item --markdown` is run, **Then** the extra field shows `FieldName:` on one line with markdown content on the next line.
3. **Given** a description containing a heading (`## Overview`) followed by paragraphs, **When** `get-item --markdown` is run, **Then** the heading appears on its own line, not concatenated with the label.

---

### Edge Cases

- What happens when a markdown field value is empty? → The label is shown with `:` followed by nothing (or empty string), no crash.
- What happens when markdown content is only whitespace after conversion? → Treat as single-line (no newlines), show on same line.
- What happens in non-markdown mode (plain text / stripHtml)? → Existing formatting behavior is preserved unchanged.
- What happens for the short-mode description summary? → Same rules apply: single-line content on same line, multi-line content on next line.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When displaying a field with markdown content, the field label MUST be followed by a `:` character.
- **FR-002**: When the markdown content is a single line (no embedded newline characters), the label and content MUST appear on the same line separated by `: ` (colon + space).
- **FR-003**: When the markdown content is multi-line (contains one or more newline characters), the content MUST start on the line immediately following the label (which ends with `:`).
- **FR-004**: The formatting fix MUST apply to all markdown-enabled fields: the main description field and any extra fields requested via `--fields`.
- **FR-005**: When markdown mode is disabled (default or `--markdown` not passed), the existing output format MUST remain unchanged.
- **FR-006**: Empty or null markdown values MUST be handled gracefully without crashing or producing malformed output.

### Key Entities

- **Field Label**: The display name of a work item field (e.g., "Description", "ReproSteps"), used as a prefix in the output line.
- **Markdown Content**: The converted markdown string (single-line or multi-line) that follows the field label.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All field labels in markdown-enabled output are separated from their values by `: ` (single-line) or a newline after `:` (multi-line) — no missing separator in any case.
- **SC-002**: Single-line field values appear on the same line as their labels in markdown mode.
- **SC-003**: Multi-line field values (descriptions with headings, lists, paragraphs) begin on the line after their label in markdown mode.
- **SC-004**: Non-markdown output (plain text, stripHtml mode) is unaffected — all existing tests continue to pass.
- **SC-005**: New unit tests covering both single-line and multi-line formatting rules are added and pass.

## Assumptions

- [AUTO] Scope: applies only to the `get-item` command text output (not JSON output); chose this because JSON already structures fields as key-value pairs and the feature description references "output" readability.
- [AUTO] Label colon: the colon is appended to the field label name (making it "FieldName:") rather than using a separator string; chose this because the description explicitly states "append a ':' char at the end of the name of the field".
- [AUTO] Single vs multi-line detection: determined by whether the converted markdown string contains `\n` characters after trimming; chose this as the natural, testable boundary.
- [AUTO] Non-markdown mode unchanged: the fix applies only when `markdown=true`; chose this to avoid regressions since the bug description references "markdown content" specifically.

## Clarifications

### Session 2026-04-03

- Q: Should the colon-space separator apply to all fields in markdown mode, including plain-text extra fields? → A: Yes, all fields in markdown mode use the new separator for consistency within a single output. [AUTO: The description says "for all markdown content", and consistency within a mode is better UX]
