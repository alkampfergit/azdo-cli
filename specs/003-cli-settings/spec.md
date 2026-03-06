# Feature Specification: CLI Settings

**Feature Branch**: `003-cli-settings`
**Created**: 2026-03-05
**Status**: Draft
**Input**: User description: "save settings for the cli, like default org, default project and additional fields to get for get-item"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Set Default Organization and Project (Priority: P1)

A developer who regularly works with the same Azure DevOps organization and project wants to save these as defaults so they don't need to specify `--org` and `--project` on every command, and don't need to be inside a git repository with an Azure DevOps remote.

**Why this priority**: This is the highest-value setting. Currently, users must either provide `--org`/`--project` flags on every invocation or be inside a git repo with an Azure DevOps remote. Saving defaults eliminates this friction for the most common use case.

**Independent Test**: Can be fully tested by running `azdo config set org myorg`, `azdo config set project myproject`, then running `azdo get-item 12345` from any directory (even outside a git repo) and verifying the saved org/project are used.

**Acceptance Scenarios**:

1. **Given** no settings exist, **When** the user runs the config set command for org and project, **Then** the values are persisted and a confirmation message is displayed.
2. **Given** default org and project are saved, **When** the user runs `get-item <id>` without `--org` and `--project` and outside an Azure DevOps git repo, **Then** the saved defaults are used to fetch the work item.
3. **Given** default org and project are saved, **When** the user runs `get-item <id>` with explicit `--org` and `--project` flags, **Then** the explicit flags take precedence over saved defaults.
4. **Given** default org and project are saved and the user is inside an Azure DevOps git repo, **When** the user runs `get-item <id>` without flags, **Then** the git remote detection takes precedence over saved defaults.

---

### User Story 2 - View and Manage Saved Settings (Priority: P2)

A developer wants to review what settings are currently saved, update individual settings, or clear settings they no longer need.

**Why this priority**: Essential for discoverability and management of the settings feature. Without the ability to view and clear settings, users cannot troubleshoot unexpected behavior or reset configuration.

**Independent Test**: Can be tested by saving a setting, viewing all settings with `azdo config list`, viewing a specific setting with `azdo config get <key>`, and clearing a setting with `azdo config unset <key>`.

**Acceptance Scenarios**:

1. **Given** settings have been saved, **When** the user runs the config list command, **Then** all saved settings and their values are displayed.
2. **Given** settings have been saved, **When** the user runs the config get command for a specific key, **Then** only that setting's value is displayed.
3. **Given** a setting exists, **When** the user runs the config unset command for that key, **Then** the setting is removed and a confirmation is displayed.
4. **Given** no settings exist, **When** the user runs the config list command, **Then** a message indicates no settings are configured.
5. **Given** a non-existent key is queried, **When** the user runs config get for that key, **Then** a clear message indicates the setting is not configured.

---

### User Story 3 - Configure Additional Fields for Get-Item (Priority: P3)

A developer wants to see additional Azure DevOps work item fields beyond the default set (ID, title, state, type, assigned-to, description) when running `get-item`. For example, they may want to always see fields like "Priority", "Story Points", "Tags", or custom fields specific to their process template.

**Why this priority**: Extends the usefulness of `get-item` for teams with custom workflows or additional metadata needs. Depends on the settings infrastructure from P1/P2 being in place.

**Independent Test**: Can be tested by running `azdo config set fields "System.Tags,Microsoft.VSTS.Common.Priority"`, then running `azdo get-item <id>` and verifying the additional fields are displayed alongside the default fields.

**Acceptance Scenarios**:

1. **Given** additional fields are configured in settings, **When** the user runs `get-item <id>`, **Then** the configured additional fields are displayed alongside the default fields.
2. **Given** additional fields are configured, **When** one of the configured fields does not exist on the work item, **Then** that field is silently omitted from the output (no error).
3. **Given** no additional fields are configured, **When** the user runs `get-item <id>`, **Then** only the default fields are displayed (existing behavior unchanged).
4. **Given** additional fields are configured in settings, **When** the user runs `get-item <id> --fields "System.Tags,Custom.Field"`, **Then** the command-line fields override the saved fields for that invocation.

---

### Edge Cases

- What happens when the settings file is corrupted or contains invalid content? The CLI should warn the user, ignore the corrupt file, and proceed as if no settings exist.
- What happens when a user sets an empty value for a key? The CLI should treat it as unsetting the key.
- What happens when the settings file location is not writable? A clear error message should explain the issue.
- What happens when both git remote detection and saved defaults are available? Git remote takes precedence, then saved defaults, then explicit flags override everything (resolution order: explicit flags > git remote > saved defaults).
- What happens when only one of org or project is saved as a default? The CLI should require both org and project to be resolvable (from any source) before proceeding.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a `config` command group with subcommands: `set`, `get`, `list`, and `unset`.
- **FR-002**: System MUST persist settings to a user-level configuration file in the user's home directory.
- **FR-003**: System MUST support the following setting keys: `org` (default organization), `project` (default project), and `fields` (additional work item fields).
- **FR-004**: System MUST resolve org/project in this order of precedence: (1) explicit `--org`/`--project` flags, (2) git remote auto-detection, (3) saved defaults from settings.
- **FR-005**: System MUST display additional configured fields in `get-item` output alongside the default fields.
- **FR-006**: System MUST allow `get-item` to accept an optional `--fields` flag that overrides the saved fields setting for that invocation.
- **FR-007**: System MUST silently omit any configured field that does not exist on the retrieved work item.
- **FR-008**: System MUST display a confirmation message after setting or unsetting a value.
- **FR-009**: System MUST handle a missing or corrupted settings file gracefully by treating it as empty settings.
- **FR-010**: System MUST validate that setting keys are recognized before saving (reject unknown keys with a clear error).
- **FR-011**: The `fields` setting MUST accept a comma-separated list of Azure DevOps field reference names (e.g., `System.Tags,Microsoft.VSTS.Common.Priority`).

### Key Entities

- **Settings Store**: A persistent, user-level store of CLI configuration key-value pairs. Located in the user's home directory.
- **Setting Key**: A recognized configuration key (`org`, `project`, `fields`) with validation rules specific to each key.
- **Additional Fields**: A list of Azure DevOps field reference names that extend the default `get-item` output.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can set, view, and clear default org/project settings in under 3 seconds per operation.
- **SC-002**: Users with saved defaults can run `get-item` without any flags or git remote, reducing per-command keystrokes by at least 50% compared to providing `--org` and `--project` explicitly.
- **SC-003**: 100% of `get-item` invocations with configured additional fields display those fields correctly when they exist on the work item.
- **SC-004**: Users experience zero disruption when no settings are configured - all existing behavior remains unchanged.

## Assumptions

- The settings file is stored in the user's home directory under a tool-specific location (e.g., `~/.azdo/config.json` or similar). The exact path is an implementation detail.
- The settings file uses a human-readable format so users can manually inspect or edit it if needed.
- The `fields` setting stores Azure DevOps field reference names using their full system names (e.g., `System.Tags`, `Microsoft.VSTS.Common.Priority`, `Custom.MyField`).
- The set of recognized setting keys is fixed for this feature (`org`, `project`, `fields`). New keys may be added in future features.
- The resolution order for org/project is: explicit flags > git remote > saved defaults. This means git remote detection (when available) takes precedence over saved defaults, preserving context-aware behavior for users working across multiple projects.
- Additional fields are displayed after the default fields in the `get-item` output, using the field's reference name as the label.
