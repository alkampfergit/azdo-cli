# Feature Specification: Pull Request Status Checks

**Feature Branch**: `011-pr-status-checks`  
**Created**: 2026-03-31  
**Status**: Draft  
**Input**: User description: "use the speckit-full skill to implement another feature for pr command, the status should return also status for the checks that are active in azure devops, in case of an error return if possible details of the error"

## Clarifications

### Session 2026-03-31

- Q: Which Azure DevOps "checks" should `azdo pr status` report? → A: Report Azure DevOps pull request status checks returned by the Git pull request statuses API. [AUTO: This API directly models PR checks, reuses the existing Git service boundary, and exposes both per-check state and description/error text.]
- Q: Which checks should be included in default output? → A: Include checks returned for each matching pull request except `notApplicable` and `notSet` states. [AUTO: Those states add noise and do not represent actionable active or meaningful check outcomes.]
- Q: Where should error detail come from? → A: Use the Azure DevOps status `description` field as the primary detail field and surface it whenever a check is in `error` or `failed` state; include it in JSON for all checks when present. [AUTO: The official PR statuses API exposes `description` as the check status description and it is the safest stable source for human-readable error detail.]

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review PR Checks with Branch Status (Priority: P1)

A CLI user wants `azdo pr status` to show Azure DevOps pull request checks alongside the pull request itself so they can understand whether the branch is ready for review or blocked by failing or pending checks.

**Why this priority**: The command already answers whether a pull request exists. Extending it with check results makes that answer actionable and completes the main branch-review workflow.

**Independent Test**: Run `azdo pr status` for a branch whose pull request has multiple Azure DevOps status checks and verify that each pull request block also lists the returned checks and their states.

**Acceptance Scenarios**:

1. **Given** the current branch has one pull request with successful and pending Azure DevOps checks, **When** the user runs `azdo pr status`, **Then** the command prints the pull request plus a readable list of those checks and their states.
2. **Given** the current branch has multiple pull requests, **When** the user runs `azdo pr status`, **Then** the command shows the checks returned for each pull request under the correct pull request entry.
3. **Given** a pull request has no returned Azure DevOps status checks, **When** the user runs `azdo pr status`, **Then** the pull request still appears and the command clearly reports that no checks are available for that pull request.

---

### User Story 2 - Surface Error Details for Failed Checks (Priority: P2)

A CLI user wants failed or errored Azure DevOps checks to include useful detail text so they can tell from the terminal why a pull request is blocked.

**Why this priority**: Check visibility is helpful, but the main operational value comes from understanding why a check failed without switching to the Azure DevOps web UI.

**Independent Test**: Run `azdo pr status` for a pull request with an `error` or `failed` Azure DevOps status check that includes a description and verify that the command prints that detail with the failing check.

**Acceptance Scenarios**:

1. **Given** a pull request status check with state `failed` and a description, **When** the user runs `azdo pr status`, **Then** the check output includes the description as error detail.
2. **Given** a pull request status check with state `error` and a description, **When** the user runs `azdo pr status`, **Then** the command includes that description rather than only the state name.
3. **Given** a failing or errored check without a description, **When** the user runs `azdo pr status`, **Then** the command still shows the check state and does not fabricate an error message.

---

### User Story 3 - Consume Check Data in Automation (Priority: P2)

An automation user wants `azdo pr status --json` to return structured Azure DevOps check data so scripts and agents can react to pending, failed, or errored checks programmatically.

**Why this priority**: The request is explicitly agent-driven. Machine-readable check state is required for reliable automation decisions.

**Independent Test**: Run `azdo pr status --json` for a pull request with multiple checks and verify that the output includes per-check identifiers, names, states, and detail text when Azure DevOps provides it.

**Acceptance Scenarios**:

1. **Given** a pull request with multiple Azure DevOps status checks, **When** the user runs `azdo pr status --json`, **Then** each returned pull request includes a `checks` array with stable fields for state, name, and available detail.
2. **Given** a pull request with no returned checks, **When** the user runs `azdo pr status --json`, **Then** the pull request still appears with an empty `checks` array.
3. **Given** the Azure DevOps checks API request fails after pull requests were resolved, **When** the user runs `azdo pr status`, **Then** the command exits non-zero with an actionable error rather than silently omitting check data.

### Edge Cases

- What happens when Azure DevOps returns `notApplicable` or `notSet` statuses? The command excludes them from default output because they do not represent actionable checks.
- What happens when different pull requests on the same branch have different returned check sets? The command keeps checks scoped to the pull request they came from and does not merge them across pull requests.
- What happens when a check has a missing context genre or name? The command still returns the check and falls back to whichever context field is present, then to a generic label when both are absent.
- What happens when a failing check has no description text? The command shows the failed state without inventing extra detail.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST extend `azdo pr status` to retrieve Azure DevOps pull request status checks for each pull request associated with the current branch.
- **FR-002**: `azdo pr status` MUST keep returning pull request discovery results even when a pull request has no returned checks.
- **FR-003**: The system MUST include a per-pull-request collection of returned checks in `azdo pr status --json`.
- **FR-004**: Each returned check MUST include a stable identifier, state, context-derived name, optional description, optional target URL, and optional creator name when Azure DevOps provides those fields.
- **FR-005**: Human-readable `azdo pr status` output MUST show returned checks underneath each pull request block.
- **FR-006**: Human-readable output MUST surface available description text for checks in `failed` or `error` state.
- **FR-007**: The system MUST exclude `notApplicable` and `notSet` check states from default output.
- **FR-008**: The system MUST preserve existing `pr status` behavior for zero pull requests, auth failures, repo resolution, and branch resolution.
- **FR-009**: The system MUST use the Azure DevOps Git pull request statuses API rather than requiring extra user input to resolve check state.
- **FR-010**: The feature MUST support the existing `--org`, `--project`, and `--json` options on `azdo pr status`.
- **FR-011**: If Azure DevOps returns an error while retrieving checks, the command MUST fail with an actionable error rather than returning partial silent output.
- **FR-012**: The implementation MUST update README command documentation to describe the new check output behavior.

### Key Entities *(include if feature involves data)*

- **Pull Request Check**: A single Azure DevOps pull request status record, including its identifier, state, context name, optional description, optional target URL, and optional creator identity.
- **Pull Request Status Result**: The `azdo pr status` response for the current branch, including branch metadata and one or more pull requests with their associated checks.
- **Branch Pull Request Match**: An existing pull request result enriched with a `checks` collection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can see pull request check states for every pull request returned by `azdo pr status` in a single command invocation.
- **SC-002**: In 100% of `failed` or `error` check cases where Azure DevOps returns description text, the command surfaces that detail in both human-readable output and JSON.
- **SC-003**: `azdo pr status --json` returns a stable `checks` array for every returned pull request, including an empty array when no checks are present.
- **SC-004**: Existing `pr status` no-results behavior remains unchanged for branches with no pull requests.

## Assumptions

- [AUTO] "Azure DevOps checks" refers to pull request status checks from the Azure DevOps Git statuses API because that is the narrowest existing API that directly exposes per-check state plus detail text.
- [AUTO] Branch policy evaluation checks are out of scope for this feature slice because the request asked to extend `pr status` conservatively and the repository already models pull request operations through the Git API.
- [AUTO] Check display should stay nested under each pull request instead of introducing a new command because the user explicitly asked to extend the existing `pr status` command.
