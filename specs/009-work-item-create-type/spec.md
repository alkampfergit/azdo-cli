# Feature Specification: Work Item Create by Type

**Feature Branch**: `009-work-item-create-type`  
**Created**: 2026-03-28  
**Status**: Draft  
**Input**: User description: "Work item create by type. upsert is locked to Task in src/commands/upsert.ts:208. Agents need Bug, User Story, Feature, Epic, etc."

## Clarifications

### Session 2026-03-28

- Q: How should callers choose the work item type for create operations? → A: Use a dedicated CLI option, `--type <work item type>`, when no ID is supplied. [AUTO: Azure DevOps create requests require the type in the endpoint path, so a command option is the smallest change that fits the existing CLI.]
- Q: What should happen when `--type` is omitted on create? → A: Default to `Task`. [AUTO: This preserves current behavior and keeps existing automation backward compatible.]
- Q: Should `--type` be accepted together with an existing work item ID? → A: No, reject that combination. [AUTO: The requested scope is create-time type selection, not changing an existing work item's type.]
- Q: Should success output identify the actual created or updated work item type? → A: Yes. [AUTO: Reporting "Created task" would be misleading when the command creates a Bug, User Story, Feature, or Epic.]

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a Specific Work Item Type (Priority: P1)

A CLI user wants `azdo upsert` to create a non-Task Azure DevOps work item, such as a Bug, User Story, Feature, or Epic, while still using the same markdown document format for fields.

**Why this priority**: This is the actual feature request. Without create-time type selection, the command cannot represent the work item categories agents need for planning and delivery workflows.

**Independent Test**: Run `azdo upsert --type "User Story" --content <doc>` and verify that Azure DevOps creates a `User Story`, not a `Task`, while applying the declared fields from the document.

**Acceptance Scenarios**:

1. **Given** a valid markdown document with a non-empty Title, **When** the user runs `azdo upsert --type Bug --content <doc>`, **Then** the command creates a Bug and reports the resulting ID and work item type.
2. **Given** a valid markdown document with a non-empty Title, **When** the user runs `azdo upsert --type "User Story" --file <path>`, **Then** the command creates a User Story from that file and deletes the file only after the create succeeds.
3. **Given** a valid markdown document with a non-empty Title, **When** the user runs `azdo upsert --type Epic --content <doc> --json`, **Then** the JSON result identifies that an Epic was created.

---

### User Story 2 - Preserve Existing Task Create Behavior (Priority: P2)

A CLI user with existing automation wants current `azdo upsert` create flows to keep working without any new required option, so Task creation remains the default.

**Why this priority**: Backward compatibility matters for existing scripts and habits that already rely on Task creation when no ID is provided.

**Independent Test**: Run `azdo upsert --content <doc>` without `--type` and verify that the command still creates a Task exactly as before.

**Acceptance Scenarios**:

1. **Given** a valid markdown document with a non-empty Title, **When** the user runs `azdo upsert --content <doc>` without `--type`, **Then** the command creates a Task.
2. **Given** an existing work item ID and a valid markdown document, **When** the user runs `azdo upsert <id> --content <doc>`, **Then** the command updates the existing work item and does not require or infer a create-time type.

---

### User Story 3 - Reject Ambiguous Type Usage (Priority: P2)

A CLI user wants clear feedback when they supply `--type` in a way that the command cannot safely interpret, so failures are actionable instead of surprising.

**Why this priority**: Type selection only makes sense for create requests. Clear rejection of invalid combinations prevents silent misuse and reduces ambiguity in automation.

**Independent Test**: Run `azdo upsert 123 --type Bug --content <doc>` and verify that the command fails locally with an actionable error before any Azure DevOps write occurs.

**Acceptance Scenarios**:

1. **Given** an existing work item ID, **When** the user runs `azdo upsert <id> --type Feature --content <doc>`, **Then** the command rejects the request and explains that `--type` is only valid for create operations.
2. **Given** a create request whose `--type` value is empty or whitespace-only, **When** the user runs `azdo upsert --type "   " --content <doc>`, **Then** the command rejects the request locally with an actionable validation error.

### Edge Cases

- What happens when the work item type contains spaces, such as `User Story`? The command treats the entire option value as the requested Azure DevOps work item type.
- What happens when the requested type is not valid in the target Azure DevOps project or process? The command forwards the server rejection as an actionable create error.
- What happens when `--type` is supplied for an update? The command rejects the request locally before any write occurs.
- What happens when the user omits `--type` on create? The command preserves the current default and creates a Task.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow `azdo upsert` create operations to target an Azure DevOps work item type other than `Task`.
- **FR-002**: The `upsert` command MUST accept a `--type <work item type>` option for create operations.
- **FR-003**: When `--type` is omitted for a create operation, the system MUST default the created work item type to `Task`.
- **FR-004**: When a work item ID is supplied, the system MUST treat the command as an update and MUST reject the `--type` option.
- **FR-005**: The system MUST validate that the `--type` value is non-empty after trimming surrounding whitespace.
- **FR-006**: The system MUST pass the requested work item type to Azure DevOps using the existing create transport path for work item creation.
- **FR-007**: The system MUST preserve the existing markdown document format, parser behavior, and update semantics for all non-type fields.
- **FR-008**: Human-readable success output MUST identify the resulting work item type for both create and update operations.
- **FR-009**: JSON success output MUST include the resulting work item type for both create and update operations.
- **FR-010**: File-based create requests using `--type` MUST preserve the existing success-only file deletion behavior.
- **FR-011**: The system MUST surface Azure DevOps create rejections for unsupported or invalid work item types as actionable errors.

### Key Entities *(include if feature involves data)*

- **Upsert Create Request**: A create-mode `azdo upsert` invocation with no work item ID, one markdown document source, and an optional requested work item type supplied via `--type`.
- **Requested Work Item Type**: The caller-provided Azure DevOps work item type label used only for create operations; when absent, the CLI defaults it to `Task`.
- **Upsert Result**: The command outcome returned to the caller, including whether the operation created or updated a work item, the resulting ID, the applied fields, and the resulting work item type.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create Bug, User Story, Feature, Epic, or Task work items through `azdo upsert` without editing code.
- **SC-002**: Existing `azdo upsert --content <doc>` create workflows continue to create Tasks without requiring any new flags.
- **SC-003**: 100% of update requests that incorrectly include `--type` fail locally with an actionable error before any Azure DevOps write occurs.
- **SC-004**: 100% of successful human-readable and JSON results identify the resulting work item type accurately.

## Assumptions

- [AUTO] Type selection belongs in a CLI option rather than the markdown document because Azure DevOps create requests encode the work item type in the endpoint path, not only in patch fields.
- [AUTO] Defaulting to `Task` on create is required for backward compatibility with the current CLI behavior and existing automation.
- [AUTO] Changing the type of an existing work item is out of scope for this feature, so `--type` is create-only.
- [AUTO] The CLI should not attempt to pre-validate whether a named type exists in the target Azure DevOps process; Azure DevOps remains the source of truth for project-specific type availability.
