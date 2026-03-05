# Feature Specification: Get Work Item Command

**Feature Branch**: `002-get-item-command`
**Created**: 2026-03-05
**Status**: Draft
**Input**: User description: "Create first command called get-item that accepts the id of azure devops worktask then optionally it will accept org and project to specify organization and teamproject use an env variable to get the PAT for authorization but you should be able to do an interactive login. if org and project are not specified use git remote to get the information from the remote url, if it is not an azure devops url you should return an error"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Retrieve Work Item by ID with Explicit Org/Project (Priority: P1)

A developer wants to quickly view the details of an Azure DevOps work item by its numeric ID. They provide the organization and team project explicitly on the command line, and have a PAT configured in an environment variable.

**Why this priority**: This is the core use case - fetching a work item with all parameters explicitly provided. It delivers the primary value of the CLI tool and has the fewest dependencies.

**Independent Test**: Can be fully tested by running `azdo get-item 12345 --org myorg --project myproject` with a valid PAT environment variable and verifying the work item details are displayed.

**Acceptance Scenarios**:

1. **Given** a valid PAT is set in the environment variable, **When** the user runs `azdo get-item <id> --org <org> --project <project>`, **Then** the work item details are displayed (title, state, assigned to, description, type).
2. **Given** an invalid or expired PAT is set, **When** the user runs the command, **Then** a clear authentication error is displayed.
3. **Given** the work item ID does not exist, **When** the user runs the command, **Then** a clear "work item not found" error is displayed.

---

### User Story 2 - Retrieve Work Item Using Git Remote Auto-Detection (Priority: P2)

A developer working inside a git repository cloned from Azure DevOps wants to fetch a work item without specifying org and project every time. The CLI detects these values from the git remote URL.

**Why this priority**: This significantly improves daily developer workflow by removing the need to repeatedly specify org/project. It depends on the core retrieval logic from P1 being in place.

**Independent Test**: Can be tested by running `azdo get-item 12345` from within a git repo that has an Azure DevOps remote, and verifying org/project are correctly auto-detected and the work item is displayed.

**Acceptance Scenarios**:

1. **Given** the current directory is a git repo with an Azure DevOps remote URL (HTTPS format like `https://dev.azure.com/{org}/{project}/...`), **When** the user runs `azdo get-item <id>` without `--org` and `--project`, **Then** the org and project are extracted from the remote URL and the work item is displayed.
2. **Given** the current directory is a git repo with an Azure DevOps remote URL (SSH format like `git@ssh.dev.azure.com:v3/{org}/{project}/...`), **When** the user runs `azdo get-item <id>` without `--org` and `--project`, **Then** the org and project are extracted from the remote URL and the work item is displayed.
3. **Given** the current directory is a git repo with a legacy Azure DevOps remote URL (`https://{org}.visualstudio.com/{project}/...`), **When** the user runs `azdo get-item <id>`, **Then** the org and project are correctly extracted.
4. **Given** the current directory is a git repo with a non-Azure DevOps remote (e.g., GitHub), **When** the user runs `azdo get-item <id>` without `--org` and `--project`, **Then** a clear error message is shown indicating the remote is not an Azure DevOps URL and org/project must be provided explicitly.
5. **Given** the current directory is not a git repository, **When** the user runs `azdo get-item <id>` without `--org` and `--project`, **Then** a clear error message is shown asking the user to provide `--org` and `--project`.

---

### User Story 3 - Interactive Login When No PAT Is Available (Priority: P3)

A developer who does not have a PAT configured wants to authenticate interactively to retrieve a work item.

**Why this priority**: Provides an alternative authentication path for users who prefer not to manage PATs or are setting up the tool for the first time. The core functionality works without this via PAT.

**Independent Test**: Can be tested by unsetting the PAT environment variable, running `azdo get-item 12345 --org myorg --project myproject`, and verifying the interactive login flow prompts the user and authenticates successfully.

**Acceptance Scenarios**:

1. **Given** no PAT environment variable is set, **When** the user runs the get-item command, **Then** the CLI prompts the user to paste a PAT interactively.
2. **Given** the user completes interactive login successfully, **When** the authentication completes, **Then** the work item is retrieved and displayed.
3. **Given** the user cancels or fails interactive login, **When** the authentication fails, **Then** a clear error message is displayed with instructions on how to set up a PAT.

---

### Edge Cases

- What happens when the user provides `--org` but not `--project` (or vice versa)? The CLI should require both or neither - if only one is provided, show an error asking for the missing parameter.
- What happens when there are multiple git remotes? The CLI should use the `origin` remote by default.
- What happens when the network is unreachable? A clear connection error should be displayed.
- What happens when the PAT lacks permissions to read work items? A clear permissions error should be shown.
- What happens when the work item ID is not a valid number? The CLI should reject it with a validation error before making any API call.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept a work item ID as a required positional argument for the `get-item` command.
- **FR-002**: System MUST accept optional `--org` and `--project` flags to specify the Azure DevOps organization and team project.
- **FR-003**: System MUST read the PAT from an environment variable named `AZDO_PAT` for authentication.
- **FR-004**: System MUST display work item details including: ID, title, state, type, assigned-to, and full description by default.
- **FR-004a**: System MUST accept a `--short` flag that truncates the description to the first 3-5 lines and displays only core fields (ID, title, state, type, assigned-to).
- **FR-005**: System MUST extract organization and project from the git remote URL when `--org` and `--project` are not provided.
- **FR-006**: System MUST support Azure DevOps remote URL formats: HTTPS (`dev.azure.com`), SSH (`ssh.dev.azure.com`), and legacy (`visualstudio.com`).
- **FR-007**: System MUST return a clear error when the git remote is not an Azure DevOps URL and org/project are not provided.
- **FR-008**: System MUST return a clear error when neither git remote auto-detection nor explicit flags can determine org/project.
- **FR-009**: System MUST validate that `--org` and `--project` are either both provided or both omitted.
- **FR-010**: System MUST validate that the work item ID is a positive integer.
- **FR-011**: System MUST prompt the user to paste a PAT interactively when no PAT environment variable is set.
- **FR-012**: System MUST persist a PAT obtained via interactive prompt to the Windows Credential Manager for reuse by subsequent commands.
- **FR-013**: System MUST use PAT resolution in this order: (1) `AZDO_PAT` environment variable, (2) Windows Credential Manager, (3) interactive prompt.
- **FR-014**: System MUST display clear, actionable error messages for authentication failures, permission errors, and not-found errors.

### Key Entities

- **Work Item**: An Azure DevOps work item identified by a numeric ID. Key attributes: ID, title, state, type (bug, task, user story, etc.), assigned-to, description.
- **Organization**: The Azure DevOps organization that owns the project.
- **Team Project**: The Azure DevOps project within an organization that contains the work items.
- **Authentication Credential**: A Personal Access Token (PAT) resolved from environment variable, Windows Credential Manager, or interactive prompt (in that priority order).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can retrieve and view a work item's details in under 5 seconds from command invocation.
- **SC-002**: Users working in an Azure DevOps-cloned repository can retrieve work items without specifying org/project in 100% of cases where a valid remote exists.
- **SC-003**: 100% of error scenarios (invalid ID, auth failure, not found, non-Azure remote) produce a user-friendly message that clearly states what went wrong and how to fix it.
- **SC-004**: Users without a pre-configured PAT can authenticate and retrieve a work item through the interactive login flow on their first attempt.

## Clarifications

### Session 2026-03-05

- Q: What interactive login mechanism should be used when no PAT is set? → A: Manual PAT prompt - CLI prompts the user to paste a PAT interactively.
- Q: Should the CLI persist a PAT provided via interactive prompt? → A: Yes, persist to the Windows Credential Manager (system keychain). Only Windows is supported initially.
- Q: How should the work item description be displayed? → A: Show full description by default. A `--short` flag truncates to first 3-5 lines and shows only core fields.

## Assumptions

- The environment variable for the PAT is named `AZDO_PAT`. This is a reasonable convention matching the tool's `azdo` prefix.
- When multiple git remotes exist, `origin` is used as the default remote for auto-detection.
- The interactive login flow prompts the user to paste a PAT directly. Device code / browser-based OAuth flow may be added as a future enhancement.
- PATs obtained interactively are persisted to the Windows Credential Manager. Only Windows is supported initially; macOS Keychain and Linux secret-service support may be added later.
- PAT resolution order: environment variable > Windows Credential Manager > interactive prompt.
- Work item display format is plain text to the terminal (not JSON by default), suitable for human consumption. Full description is shown by default; `--short` truncates output. A `--json` output flag may be added in a future feature.
- The command is invoked as `azdo get-item <id>`, following the existing CLI structure from the base feature (001-azdo-cli-base).
