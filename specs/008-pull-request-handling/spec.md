# Feature Specification: Pull Request Handling

**Feature Branch**: `008-pull-request-handling`  
**Created**: 2026-03-26  
**Status**: Draft  
**Input**: User description: "create another feature that is handling pull requests, I need check if current branch has a pull requests, open a pull request for this branch against develop, get all active and not colosed comments in the pull request"

## Clarifications

### Session 2026-03-27

- Q: Where does the PR title and description come from for creation? → A: Both title and description are required CLI arguments.
- Q: What is the CLI command structure for the three operations? → A: Parent command `pr` with subcommands `pr status`, `pr open`, `pr comments`.
- Q: How should `pr comments` format its output? → A: Grouped by thread — thread header (ID, status, file/line if available) followed by indented comments.
- Q: Are `pr open` title and description positional or named flags? → A: Named flags: `--title` and `--description`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Check Pull Requests for the Current Branch (Priority: P1)

A CLI user wants to determine whether the currently checked out branch already has one or more pull requests so they can avoid duplicate review flows and immediately understand the branch's review status.

**Why this priority**: Branch-to-pull-request discovery is the prerequisite for the rest of the workflow. Users need a reliable way to know whether review work already exists before creating a new pull request or checking its discussion state.

**Independent Test**: Can be fully tested by running the branch pull request lookup while on a branch with no pull requests, then on a branch with at least one active pull request, and verifying that the result clearly distinguishes those outcomes.

**Acceptance Scenarios**:

1. **Given** the user is on a branch with no pull requests, **When** they request pull request status for the current branch, **Then** the system reports that no pull requests are associated with that branch.
2. **Given** the user is on a branch with one active pull request, **When** they request pull request status for the current branch, **Then** the system returns that pull request and identifies it as active.
3. **Given** the user is on a branch with multiple pull requests in different states, **When** they request pull request status for the current branch, **Then** the system returns each matching pull request and its current state so the user can choose the correct one.

---

### User Story 2 - Open a Pull Request Against Develop (Priority: P2)

A CLI user wants to open a new pull request from the currently checked out branch into `develop` without manually copying branch names, so they can start the review process directly from the terminal.

**Why this priority**: Creating the pull request is the main write action in this feature. It turns a working branch into a reviewable change with minimal friction and matches the requested target branch workflow.

**Independent Test**: Can be fully tested by running pull request creation from a non-`develop` branch that does not already have an active pull request to `develop`, then verifying that a new pull request is created with the current branch as source and `develop` as target.

**Acceptance Scenarios**:

1. **Given** the user is on a branch that is not `develop` and has no active pull request targeting `develop`, **When** they request pull request creation with a required title and description, **Then** the system creates a new pull request from the current branch to `develop` using the provided title and description.
2. **Given** the user is on a branch that already has an active pull request targeting `develop`, **When** they request pull request creation, **Then** the system does not create a duplicate pull request and instead returns the existing active pull request details.
3. **Given** the user is currently on `develop`, **When** they request pull request creation, **Then** the system rejects the request with an actionable explanation that a non-target source branch is required.

---

### User Story 3 - Retrieve Active Pull Request Comments (Priority: P2)

A CLI user wants to list the pull request discussion items that are still active and not closed, so they can focus only on unresolved review feedback for the current branch's pull request.

**Why this priority**: Review comments are actionable only while they remain open. Filtering out closed discussion keeps the output focused on work the user still needs to address.

**Independent Test**: Can be fully tested by retrieving comments for a pull request that contains both active and closed discussion, then verifying that only active, not closed comment threads and their visible comments are returned.

**Acceptance Scenarios**:

1. **Given** the current branch has an active pull request with both active and closed discussion, **When** the user requests active comments for that pull request, **Then** the system returns only the discussion that remains active and excludes closed discussion.
2. **Given** the current branch has an active pull request with no active comments, **When** the user requests active comments, **Then** the system reports that there are no active comments to review.
3. **Given** the current branch has multiple pull requests and only one is active, **When** the user requests active comments, **Then** the system uses the active pull request for comment retrieval.

### Edge Cases

- What happens when the current directory is not on a named branch? The system fails with an actionable error explaining that a checked out branch is required.
- What happens when the current branch has only completed or abandoned pull requests? The system reports those matches and indicates that no active pull request exists for creation reuse or comment retrieval.
- What happens when the current branch has multiple active pull requests? The system returns all matching active pull requests for discovery, and comment retrieval fails with an actionable ambiguity message instead of guessing.
- What happens when the target branch `develop` does not exist in the configured repository? The system fails with an actionable error describing that the target branch could not be found.
- What happens when pull request creation is attempted for a branch with no commits that differ from `develop`? The system reports that there is no reviewable change to open.
- What happens when a pull request has active discussion threads but individual comments inside those threads are deleted or hidden? The system excludes comments that are not visible to the user while still returning the active thread context.
- What happens when permissions allow pull request lookup but not pull request creation? The system must still allow read-only pull request status and comment retrieval while returning a clear authorization error for creation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose a `pr` parent command with three subcommands: `pr status` (check PRs for the current branch), `pr open` (create a PR to `develop`), and `pr comments` (retrieve active discussion).
- **FR-001a**: The system MUST provide a way to check pull requests associated with the currently checked out branch via `pr status`.
- **FR-002**: When checking pull requests for the current branch, the system MUST identify the branch from the local repository context without requiring the user to type the branch name again.
- **FR-003**: The system MUST return each pull request associated with the current branch together with its current state.
- **FR-004**: When no pull requests are associated with the current branch, the system MUST return a clear no-results outcome instead of treating that condition as an execution failure.
- **FR-005**: The `pr open` subcommand MUST open a new pull request using the currently checked out branch as the source branch, accepting a required `--title <title>` flag and a required `--description <description>` flag.
- **FR-005a**: Pull request creation MUST require both `--title` and `--description` flags; the command MUST fail with an actionable error if either is missing.
- **FR-006**: Pull request creation MUST target the `develop` branch by default for this workflow.
- **FR-007**: Before creating a new pull request, the system MUST check whether the current branch already has an active pull request targeting `develop`.
- **FR-008**: If the current branch already has an active pull request targeting `develop`, the system MUST not create a duplicate pull request and MUST return the existing pull request details.
- **FR-009**: The system MUST reject pull request creation when the current branch is `develop`.
- **FR-010**: The system MUST return a clear success result for pull request creation, including the created pull request identifier and web link.
- **FR-011**: The `pr comments` subcommand MUST retrieve active, not closed pull request discussion for the relevant pull request of the current branch.
- **FR-012**: Comment retrieval MUST exclude pull request discussion that is closed, completed, or otherwise no longer active.
- **FR-013**: When the relevant pull request has no active comments, the system MUST return a clear empty-result outcome.
- **FR-014**: If multiple active pull requests exist for the current branch and the system cannot determine a single relevant pull request unambiguously, the system MUST fail with an actionable message that identifies the ambiguity.
- **FR-015**: The system MUST surface authorization, repository resolution, and branch resolution failures as actionable errors.
- **FR-016**: The feature MUST follow the same authentication and organization or project resolution behavior as the existing Azure DevOps CLI commands in this repository.
- **FR-017**: The `pr comments` output MUST group results by thread, displaying a thread header (thread ID, status, and file/line reference if available) followed by indented comments belonging to that thread, so a user can immediately identify which discussion thread each comment belongs to.

### Key Entities *(include if feature involves data)*

- **Branch Pull Request Match**: A pull request associated with the currently checked out branch, including its identifier, source branch, target branch, current state, and link.
- **Pull Request Creation Result**: The outcome of attempting to open a pull request from the current branch to `develop`, including whether a new pull request was created or an existing active pull request was reused.
- **Active Comment Thread**: A pull request discussion thread that is still active and contains one or more visible comments that have not been excluded by closed-thread filtering.
- **Active Pull Request Comment**: A visible review comment that belongs to an active comment thread and remains relevant for user action.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can determine in a single invocation whether the current branch has zero, one, or multiple associated pull requests and can see the state of each returned pull request.
- **SC-002**: When the current branch has no active pull request to `develop`, users can open one new pull request to `develop` in a single invocation without manually entering the source branch name.
- **SC-003**: In 100% of cases where an active pull request from the current branch to `develop` already exists, the feature returns that pull request instead of creating a duplicate.
- **SC-004**: Users can retrieve only active, not closed pull request discussion for the relevant pull request of the current branch in a single invocation.
- **SC-005**: In 100% of comment-retrieval results, closed discussion is excluded from the returned active comment set.
- **SC-006**: In 100% of branch ambiguity, missing-branch, missing-target, and authorization failure cases, the feature returns an actionable error that explains why the request could not be completed.

## Assumptions

- The feature operates against the repository configured for the current local checkout and resolves the current branch from the local Git state.
- The requested workflow uses `develop` as the standard pull request target branch for this repository.
- A pull request is considered associated with the current branch when it uses that branch as its source branch in the current repository.
- For comment retrieval, active discussion means unresolved or otherwise open discussion that has not been closed.
- When more than one active pull request matches the current branch, returning comments without explicit disambiguation is riskier than failing and asking the user to choose.
