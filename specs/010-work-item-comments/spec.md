# Feature Specification: Work Item Comments

**Feature Branch**: `010-work-item-comments`  
**Created**: 2026-03-28  
**Status**: Draft  
**Input**: User description: "Read and post work item comments. Agents need to post progress updates with azdo comments add <id> text and read work item discussion threads to understand context and decisions. There is currently no way to interact with the comment history of a work item."

## Clarifications

### Session 2026-03-28

- Q: What CLI structure should comment operations use? → A: Use a top-level `comments` command group with `comments list` and `comments add`. [AUTO: This matches the user's `azdo comments add <id> ...` example and fits the existing grouped `pr` command pattern.]
- Q: How should listed work item discussion be presented? → A: Return the visible work item comment history as a chronological feed, newest comment first, with author and timestamp on each entry. [AUTO: Azure DevOps work item comments are a history stream rather than PR-style active threads, and newest-first keeps recent decisions visible.]
- Q: What should the default read scope be? → A: Retrieve the full visible comment history for the work item and omit deleted comments by default. [AUTO: The request is to understand context and decisions, which implies history rather than a single page, while deleted comments should stay out of the default view.]
- Q: What input format should new comments accept? → A: Accept the new comment text as a required positional argument and submit it as Markdown-capable content without further transformation. [AUTO: This keeps the command aligned with the requested `azdo comments add <id> "..."` usage and preserves simple agent-authored progress updates.]

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read Work Item Discussion History (Priority: P1)

A CLI user wants to read the visible comments attached to a work item so they can understand prior decisions, context, and current discussion without leaving the terminal.

**Why this priority**: Reading the existing discussion is the prerequisite for informed follow-up work. Without it, agents and users lack the context needed to act safely on a work item.

**Independent Test**: Run `azdo comments list <id>` for a work item with several comments and verify that the command returns the full visible history in reverse chronological order with author and timestamp metadata.

**Acceptance Scenarios**:

1. **Given** a work item with three visible comments, **When** the user runs `azdo comments list <id>`, **Then** the command returns those comments newest first with enough metadata to identify who said what and when.
2. **Given** a work item with no visible comments, **When** the user runs `azdo comments list <id>`, **Then** the command succeeds and clearly reports that the work item has no comments.
3. **Given** a work item with both visible and deleted comments, **When** the user runs `azdo comments list <id>`, **Then** the command excludes deleted comments from the default output.

---

### User Story 2 - Post a Progress Update Comment (Priority: P2)

A CLI user wants to add a new comment to a work item so they can post progress updates, decisions, or handoff notes directly from automation or a terminal workflow.

**Why this priority**: Posting updates is a core collaboration action for agents. Once users can review the history, the next essential step is to contribute to that history without switching tools.

**Independent Test**: Run `azdo comments add <id> "Progress update"` and verify that Azure DevOps creates a new visible comment on the target work item and that the CLI reports the resulting comment identifier.

**Acceptance Scenarios**:

1. **Given** a valid work item ID and non-empty comment text, **When** the user runs `azdo comments add <id> "Investigating root cause"`, **Then** the command creates a new comment on that work item and reports success with the work item ID and comment ID.
2. **Given** a valid work item ID and comment text that contains markdown-style formatting, **When** the user runs `azdo comments add <id> "<markdown text>"`, **Then** the command stores the comment content without stripping that formatting from the request.
3. **Given** comment text that is empty or whitespace-only, **When** the user runs `azdo comments add <id> "   "`, **Then** the command rejects the request locally before any Azure DevOps write occurs.

---

### User Story 3 - Use Comments in Automation (Priority: P2)

An automation user wants both comment commands to return stable structured output and actionable failures so scripts and agents can consume the results reliably.

**Why this priority**: The feature request is explicitly agent-driven. Script-friendly output and clear failures are necessary for autonomous tooling to use comment history safely.

**Independent Test**: Run `azdo comments list <id> --json` and `azdo comments add <id> "Update" --json`, then verify that both commands emit valid JSON with enough identifiers and content fields for a script to act on the results.

**Acceptance Scenarios**:

1. **Given** a work item with visible comments, **When** the user runs `azdo comments list <id> --json`, **Then** the command returns machine-readable comment history including the work item ID and the returned comments.
2. **Given** a successful comment creation, **When** the user runs `azdo comments add <id> "Done" --json`, **Then** the command returns machine-readable data describing the created comment.
3. **Given** a missing work item, invalid credentials, or insufficient permissions, **When** the user runs either comment command, **Then** the command exits non-zero and prints an actionable error message to stderr.

### Edge Cases

- What happens when the work item has a long comment history that Azure DevOps returns in multiple pages? The command continues retrieving pages until the full visible history has been collected.
- What happens when a visible comment is missing author display information? The command still returns the comment and falls back to an `Unknown` author label in human-readable output.
- What happens when the user supplies an invalid work item ID? The command rejects the input locally before any Azure DevOps request is made.
- What happens when the user targets a real work item that has no comments yet? Listing comments is still a successful read with an explicit empty-state message.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose a top-level `comments` command group for work item comment operations.
- **FR-002**: The system MUST provide a `comments list <id>` command that reads comments for a specific work item.
- **FR-003**: `comments list <id>` MUST return the full visible comment history for the target work item by default.
- **FR-004**: `comments list <id>` MUST exclude deleted comments from the default result set.
- **FR-005**: Human-readable list output MUST identify each returned comment with its comment ID, author, and creation or modification timestamp, and MUST display comments in newest-first order.
- **FR-006**: When a work item has no visible comments, `comments list <id>` MUST succeed with an explicit empty-state message.
- **FR-007**: The system MUST provide a `comments add <id> <text>` command that creates a new comment on a specific work item.
- **FR-008**: `comments add <id> <text>` MUST reject empty or whitespace-only comment text before any Azure DevOps write occurs.
- **FR-009**: Successful comment creation MUST report the target work item ID and the created comment ID.
- **FR-010**: Both `comments list` and `comments add` MUST support `--json` output with stable machine-readable result shapes.
- **FR-011**: Both comment commands MUST support the existing `--org` and `--project` override pattern.
- **FR-012**: Both comment commands MUST use meaningful exit codes, writing success output to stdout and failures to stderr.
- **FR-013**: Authentication, permission, and missing-work-item failures for comment operations MUST produce actionable error messages.
- **FR-014**: The system MUST preserve user-supplied comment text as the submitted comment body rather than rewriting or reformatting it.

### Key Entities *(include if feature involves data)*

- **Work Item Comment**: A single visible or deleted discussion entry attached to one work item, including its identifier, body text, author identity, timestamps, and deletion state.
- **Comment History Result**: The list-command response for one work item, including the work item identifier and the ordered set of returned comments.
- **Comment Creation Result**: The add-command response describing the newly created comment, including the work item identifier, comment identifier, and stored text.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can retrieve a work item's visible comment history from the CLI with a single read command and without opening the Azure DevOps web UI.
- **SC-002**: Users can post a progress update comment from the CLI with a single write command that reports the created comment identifier.
- **SC-003**: 100% of whitespace-only comment submissions fail locally before any remote write is attempted.
- **SC-004**: 100% of successful list and add executions can return valid JSON output for automation when `--json` is supplied.

## Assumptions

- [AUTO] Work item comments belong under a dedicated `comments` command group because the user explicitly referenced `azdo comments add <id> ...` and the repo already uses grouped commands for related operations.
- [AUTO] Work item discussion should be modeled as comment history rather than thread state because Azure DevOps work items expose comments as a linear discussion stream, unlike the existing pull request thread feature.
- [AUTO] Listing comments should retrieve the full visible history by default because the stated user need is to understand context and decisions, which depends on history rather than a partial page.
- [AUTO] Deleted comments are out of the default scope because they do not represent actionable current context and would add noise to terminal output.
- [AUTO] Editing or deleting existing comments is out of scope because the request only asked to read history and post new updates.
