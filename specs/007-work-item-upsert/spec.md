# Feature Specification: Task Upsert from Markdown

**Feature Branch**: `007-work-item-upsert`  
**Created**: 2026-03-24  
**Status**: Draft  
**Input**: User description: "I need a command upsert that will create / update a azure devops task being able to specify multiple values, title, assigned to , and other fields, the goal is specifying all the data into a single markdown text that can be passed as inline paremeter or as a file on disk. If passed on file on disk it will be deleted after a successufl import. We specify the id with a parameter if the parameter is no tpresent will be created, the markdown should have a way to specify for each field the value we want, considering that we can have simple field or complex markdown fields."

## Clarifications

### Session 2026-03-24

- Q: What is the canonical task document format for the markdown payload? → A: Use YAML front matter for simple fields, followed by named markdown sections for rich-text fields.
- Q: How should fields be identified in the task document? → A: Allow friendly names for known common fields and reference names for any field.
- Q: How should users explicitly clear a field during update? → A: In YAML, a field set to `null` or empty clears that simple field; a present but empty markdown section clears that rich-text field.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create or Update a Task from One Markdown Payload (Priority: P1)

A CLI user wants one `upsert` command that can either create a new Azure DevOps Task or update an existing one by supplying a single markdown payload that contains all field values together, including the title, assigned user, and any other supported fields.

**Why this priority**: This is the core value of the feature. It removes the need for multiple commands or repeated field-by-field updates and makes bulk task editing practical from the terminal.

**Independent Test**: Can be fully tested by running `upsert` once without an ID to create a new Task and once with an existing ID to update that Task, verifying that all fields described in the markdown payload are applied correctly.

**Acceptance Scenarios**:

1. **Given** a valid markdown payload containing a title and other field values, **When** the user runs `azdo upsert` without an ID, **Then** a new Azure DevOps Task is created and the command reports the new task ID and the fields that were applied.
2. **Given** an existing task ID and a valid markdown payload containing changed values, **When** the user runs `azdo upsert <id>`, **Then** the identified Task is updated and the command reports the task ID and the updated fields.
3. **Given** an existing task ID and a markdown payload that omits some fields, **When** the user runs `azdo upsert <id>`, **Then** only the fields declared in the payload are changed and all other task fields remain unchanged.
4. **Given** an existing task ID and a markdown payload that explicitly sets a simple field to empty or `null`, or provides an empty rich-text section, **When** the user runs `azdo upsert <id>`, **Then** the specified field is cleared if that field allows empty values.

---

### User Story 2 - Import a Task Definition from a File (Priority: P2)

A CLI user wants to keep the task definition in a markdown file on disk, pass that file to the command, and have the file automatically removed after a successful import so temporary import files do not accumulate.

**Why this priority**: File-based import supports longer task definitions and fits existing documentation workflows. Automatic cleanup reduces manual housekeeping for scripted or temporary imports.

**Independent Test**: Can be fully tested by creating a temporary markdown file, importing it successfully, and verifying that the task is created or updated and that the source file no longer exists after the command succeeds.

**Acceptance Scenarios**:

1. **Given** a readable markdown file containing a valid task definition, **When** the user runs `azdo upsert --file <path>` without an ID, **Then** a new Task is created from that file and the file is deleted after the command completes successfully.
2. **Given** a readable markdown file containing a valid task definition and an existing task ID, **When** the user runs `azdo upsert <id> --file <path>`, **Then** the existing Task is updated from that file and the file is deleted after the command completes successfully.
3. **Given** a markdown file import fails for any reason, **When** the command exits with an error, **Then** the source file is preserved so the user can inspect or retry it.

---

### User Story 3 - Mix Simple Fields and Rich Text Fields in One Payload (Priority: P2)

A CLI user wants the markdown payload format to support both simple fields such as Title and Assigned To and longer rich-text fields such as Description or Acceptance Criteria, so a single document can represent the full desired state of a task.

**Why this priority**: The single-document workflow only becomes useful if it can capture the full range of field types users care about, not just short scalar fields.

**Independent Test**: Can be fully tested by importing a markdown payload that contains both simple fields and multi-line rich-text fields, then verifying that each field value appears correctly on the Task.

**Acceptance Scenarios**:

1. **Given** a markdown payload that defines simple fields such as Title, Assigned To, and State, **When** the user runs `azdo upsert`, **Then** each simple field is stored with the exact intended value.
2. **Given** a markdown payload that defines rich-text fields with headings, lists, links, or other markdown formatting, **When** the user runs `azdo upsert`, **Then** the rich-text content is stored completely and remains readable as formatted task content.
3. **Given** a markdown payload that mixes simple fields and rich-text fields, **When** the user runs `azdo upsert`, **Then** all declared fields are applied as part of the same command outcome.

### Edge Cases

- What happens when the user provides both inline markdown content and a file path? The command rejects the request and explains that exactly one content source must be used.
- What happens when the user provides an ID for a task that does not exist or cannot be updated? The command reports that the target task could not be found or changed, and no source file is deleted.
- What happens when the markdown payload is malformed, ambiguous, or declares the same field more than once? The command fails with a validation error that identifies the problematic part of the payload.
- What happens when the user attempts to create a task without providing the minimum required fields? The command fails locally when `Title` is missing or empty, and reports actionable Azure DevOps validation errors for any additional process-specific required fields returned by the server.
- What happens when the payload includes an unknown or unsupported field name? The command fails with an actionable error identifying the field that could not be mapped.
- What happens when a rich-text field is intentionally empty? The command applies an empty value to that field if the target field allows clearing.
- What happens when a simple field is intentionally set to empty or `null`? The command treats that as an explicit clear request for that field if the target field allows clearing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide an `upsert` command for Azure DevOps Tasks.
- **FR-002**: The `upsert` command MUST create a new Task when the user does not provide a task ID.
- **FR-003**: The `upsert` command MUST update an existing Task when the user provides a task ID.
- **FR-004**: The `upsert` command MUST accept the task definition as inline markdown text.
- **FR-005**: The `upsert` command MUST accept the task definition from a markdown file on disk.
- **FR-006**: The system MUST reject requests that provide more than one task-definition source at the same time.
- **FR-007**: When the task definition is provided from a file and the upsert operation succeeds, the system MUST delete that source file after the success is confirmed.
- **FR-008**: When the task definition is provided from a file and the upsert operation fails, the system MUST leave that source file untouched.
- **FR-009**: The markdown task definition MUST use YAML front matter to declare simple Task field values.
- **FR-010**: The markdown task definition MUST use named markdown sections after the front matter to declare multi-line rich-text field values.
- **FR-011**: Users MUST be able to set common fields such as Title and Assigned To using friendly field names in the markdown task definition.
- **FR-012**: Users MUST be able to set any other supported Task field using its Azure DevOps reference name in the same markdown task definition.
- **FR-013**: For update operations, the system MUST modify only the fields explicitly declared in the supplied task definition.
- **FR-014**: For create operations, the system MUST validate that the supplied task definition includes the universally required Task fields enforced by this CLI, specifically a non-empty Title, before sending the request, and MUST surface any additional Azure DevOps process-specific required-field errors as actionable errors.
- **FR-015**: The system MUST validate the markdown task definition before sending changes and MUST report malformed, ambiguous, duplicate, or unmappable field declarations with actionable errors.
- **FR-016**: The system MUST return a clear success result for both create and update operations, including whether a Task was created or updated and the resulting task ID.
- **FR-017**: The `upsert` command MUST follow the same authentication and organization/project resolution behavior as the existing work-item commands.
- **FR-018**: The system MUST preserve rich-text field content provided in the markdown task definition without truncating or flattening multi-line formatting.
- **FR-019**: For update operations, a simple field declared with an empty value or `null` in YAML front matter MUST be treated as an explicit request to clear that field when the target field allows clearing.
- **FR-020**: For update operations, a rich-text field declared as a present but empty markdown section MUST be treated as an explicit request to clear that field when the target field allows clearing.

### Key Entities *(include if feature involves data)*

- **Task Upsert Document**: A single markdown document supplied inline or from a file that describes the desired Task field values. It begins with YAML front matter for simple fields and is followed by named markdown sections for longer rich-text fields.
- **Task Field Entry**: One declared field/value pair inside the Task Upsert Document. A field entry is either a simple field declared in YAML front matter or a rich-text field declared as a named markdown section, using friendly names for common fields and reference names for any other supported fields.
- **Upsert Result**: The outcome of one `upsert` command invocation. It identifies whether the operation created a new Task or updated an existing one and includes the resulting task ID.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a new Azure DevOps Task with multiple field values from one markdown payload in a single command invocation.
- **SC-002**: Users can update an existing Azure DevOps Task with multiple field values from one markdown payload in a single command invocation.
- **SC-003**: In 100% of successful file-based imports, the imported file is deleted only after the Task create or update operation succeeds.
- **SC-004**: In 100% of failed file-based imports, the imported file remains on disk for retry or inspection.
- **SC-005**: Users can include both simple fields and rich-text fields in one task-definition document, and all declared fields are applied together without requiring separate commands.
- **SC-006**: 100% of invalid task-definition inputs (missing required fields, unknown field names, malformed structure, duplicate field declarations, conflicting input sources) return actionable error messages that explain how to correct the request.

## Assumptions

- This feature targets Azure DevOps Task work items specifically, not arbitrary work item types.
- The markdown task definition applies only the fields that are explicitly declared; omitted fields are treated as "leave unchanged" during updates.
- File deletion applies only to files explicitly passed for import and only after a confirmed successful operation.
- Users may identify common fields with friendly names and any other supported field with its Azure DevOps reference name.
- The canonical task document shape is YAML front matter for scalar fields plus named markdown body sections for rich-text fields.
- Azure DevOps process-specific required fields beyond Title may vary by project/process and are validated server-side after the CLI performs its local create validation.
- For updates, omitted fields mean "leave unchanged," while present empty values mean "clear this field" when the target field supports clearing.
