# Feature Specification: Auto Markdown Display for Rich Text Fields

**Feature Branch**: `006-auto-md-display`
**Created**: 2026-03-09
**Status**: Draft
**Input**: User description: "I want for each field that is rich text to add an option to always show the field as markdown, like for get-item"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure Automatic Markdown Display (Priority: P1)

A CLI user who frequently works with rich text fields (e.g., Description, Repro Steps, Acceptance Criteria) wants to set a persistent preference so that every time they retrieve a work item, rich text fields are automatically converted from HTML to readable markdown — without needing to use the separate `get-md-field` command or pass a flag each time.

**Why this priority**: This is the core value of the feature — eliminating repetitive manual steps for users who always prefer markdown output. It directly addresses the user's request.

**Independent Test**: Can be fully tested by setting the configuration option, then running `get-item` and verifying that the Description field (and any other rich text fields) appear as markdown instead of stripped HTML.

**Acceptance Scenarios**:

1. **Given** the user has set the `markdown` config option to `true`, **When** they run `azdo get-item <id>`, **Then** all rich text fields (Description and any extra fields containing HTML) are displayed as markdown.
2. **Given** the user has NOT set the `markdown` config option, **When** they run `azdo get-item <id>`, **Then** rich text fields are displayed using the existing stripped-HTML behavior (backward compatible).
3. **Given** the user has set the `markdown` config option to `true`, **When** they run `azdo get-item <id> --no-markdown`, **Then** rich text fields are displayed using the existing stripped-HTML behavior (per-command override).

---

### User Story 2 - Per-Command Markdown Toggle (Priority: P2)

A CLI user who has NOT configured the global markdown preference still wants the ability to see markdown output on a per-command basis by passing a flag, without needing to use the separate `get-md-field` command.

**Why this priority**: Provides flexibility for users who only occasionally want markdown output, and complements the persistent setting from P1.

**Independent Test**: Can be tested by running `get-item <id> --markdown` without any config setting and verifying that rich text fields appear as markdown.

**Acceptance Scenarios**:

1. **Given** the user has no `markdown` config option set, **When** they run `azdo get-item <id> --markdown`, **Then** all rich text fields are displayed as markdown.
2. **Given** the user has set `markdown` config to `true`, **When** they run `azdo get-item <id> --no-markdown`, **Then** all rich text fields are displayed as stripped HTML.

---

### User Story 3 - Markdown Display for Extra Fields (Priority: P2)

When the user retrieves a work item with additional fields (via `--fields` or the `fields` config), any extra field that contains HTML content should also be converted to markdown when the markdown option is active.

**Why this priority**: Ensures consistency — all rich text content is treated the same way, not just the Description field.

**Independent Test**: Can be tested by running `get-item <id> --fields Microsoft.VSTS.TCM.ReproSteps --markdown` and verifying all HTML-containing extra fields are rendered as markdown.

**Acceptance Scenarios**:

1. **Given** the markdown option is active (via config or flag), **When** the user retrieves a work item with extra fields that contain HTML, **Then** those fields are displayed as markdown.
2. **Given** the markdown option is active, **When** the user retrieves a work item with extra fields that contain plain text (no HTML), **Then** those fields are displayed as-is without modification.

---

### Edge Cases

- What happens when the Description field is empty or null? The system should display nothing for that field, regardless of the markdown setting.
- What happens when a field contains malformed HTML? The system should still attempt conversion and fall back to stripped HTML if conversion fails.
- What happens when a field contains a mix of HTML and plain text? The HTML detection logic should determine whether conversion is needed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support a new `markdown` setting in the CLI configuration (`azdo config set markdown true/false`) that controls whether rich text fields are displayed as markdown by default.
- **FR-002**: System MUST support a `--markdown` flag on the `get-item` command that enables markdown display for that invocation.
- **FR-003**: System MUST support a `--no-markdown` flag on the `get-item` command that disables markdown display for that invocation, overriding the config setting.
- **FR-004**: When markdown display is active, the system MUST convert all fields detected as HTML to markdown format using the existing HTML-to-markdown conversion capability.
- **FR-005**: When markdown display is active, fields that do not contain HTML MUST be displayed unchanged.
- **FR-006**: The resolution order for the markdown setting MUST be: command-line flag > config file > default (off).
- **FR-007**: The `markdown` config setting MUST be manageable via the existing `config set`, `config get`, `config unset`, and `config list` commands.
- **FR-008**: When markdown display is NOT active, the system MUST preserve existing behavior (stripped HTML display) for full backward compatibility.

### Key Entities

- **CLI Config (`markdown`)**: A boolean setting stored in the CLI config file that controls the default markdown display preference.
- **Rich Text Field**: Any work item field whose value contains HTML content, as detected by the existing HTML detection logic.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users who enable the markdown setting see all rich text fields rendered as readable markdown with zero additional flags or commands required.
- **SC-002**: Existing users who do not enable the setting experience no change in output behavior (100% backward compatibility).
- **SC-003**: The `--markdown` / `--no-markdown` flags correctly override the config setting in all combinations.
- **SC-004**: All HTML-containing fields (Description and extra fields) are consistently converted when the option is active.

## Assumptions

- The existing HTML-to-markdown conversion utilities are sufficient for this feature — no new conversion capability is needed.
- The `markdown` config key follows the same persistence model as existing settings (`org`, `project`, `fields`).
- Boolean config values will be stored as `true`/`false` strings in the config file, consistent with CLI conventions.
