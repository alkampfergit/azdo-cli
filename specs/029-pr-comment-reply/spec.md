# Feature Specification: PR Comment Reply

**Feature Branch**: `029-pr-comment-reply`  
**Created**: 2026-06-15  
**Status**: Draft  
**Input**: User description: "Add command to post replies to pull request comments in Azure DevOps CLI"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reply to a PR thread (Priority: P1)

An automation script or developer needs to post a reply to a specific comment thread on an Azure DevOps pull request without leaving the terminal. They have already listed the comments (via `azdo pr comments`) and know the thread ID they want to respond to.

**Why this priority**: This is the core MVP — the ability to write back to a PR thread. All other stories depend on this capability existing first.

**Independent Test**: Can be fully tested by running `azdo pr comments reply <threadId> "some text"` on a PR with a known thread, then re-running `azdo pr comments` and confirming the reply appears.

**Acceptance Scenarios**:

1. **Given** an authenticated user with a PR open on the current branch, **When** the user runs `azdo pr comments reply <threadId> "reply text"`, **Then** the reply is posted to the specified thread and the CLI prints a confirmation including the PR number, thread ID, and comment ID.
2. **Given** an authenticated user who specifies `--pr-number <N>`, **When** the user runs `azdo pr comments reply <threadId> "reply text" --pr-number <N>`, **Then** the reply is posted to the specified PR's thread regardless of the current git branch.
3. **Given** the user provides an empty string as reply text, **When** the command runs, **Then** the CLI exits with a non-zero code and prints a clear error message before contacting the server.

---

### User Story 2 - JSON output for scripted use (Priority: P2)

A script or automation tool needs structured confirmation after posting a reply, to record the new comment ID or verify the post succeeded.

**Why this priority**: Consistent with the rest of the `azdo` CLI which supports `--json` on every command; important for programmatic use (the primary use case described in the issue).

**Independent Test**: Can be fully tested by running `azdo pr comments reply <threadId> "text" --json` and parsing the JSON output.

**Acceptance Scenarios**:

1. **Given** a successful reply post, **When** `--json` is supplied, **Then** the CLI emits a single JSON object containing at least `pullRequestId`, `threadId`, `commentId`, and `content`.
2. **Given** a failed post (e.g. thread not found), **When** `--json` is supplied, **Then** the CLI still exits non-zero and the error goes to stderr; stdout is empty.

---

### User Story 3 - Clear error messages for invalid inputs (Priority: P3)

A user accidentally supplies a non-existent thread ID or a thread ID belonging to a different PR. The CLI should tell them what went wrong without ambiguity.

**Why this priority**: Reduces user frustration and support burden when the command is misused; lower priority because the happy path is more critical.

**Independent Test**: Can be fully tested by invoking the command with a non-existent thread ID and verifying the error message and exit code.

**Acceptance Scenarios**:

1. **Given** a thread ID that does not exist on the target PR, **When** the user runs the reply command, **Then** the CLI exits non-zero and prints `Thread #<id> not found on pull request #<pr>.` to stderr.
2. **Given** no active PR for the current branch and no `--pr-number` flag, **When** the user runs the reply command, **Then** the CLI exits non-zero and prints `No active pull request found for branch <branch>.` to stderr.
3. **Given** a non-integer value as the thread ID, **When** the user runs the reply command, **Then** the CLI exits non-zero and prints a validation error before making any network call.

---

### Edge Cases

- What happens when the reply text contains special characters (quotes, newlines, Unicode)?
  - System must preserve the text exactly as supplied and post it to the thread without mangling.
- What happens when the thread is already resolved/closed?
  - System posts the reply regardless of thread status; the server decides whether to accept it. If the server rejects it, the CLI surfaces the error clearly.
- What happens when the target PR is abandoned or completed?
  - The command does not pre-validate PR state; the server's response determines the outcome. Any server-side rejection is surfaced as a clear error message.
- What happens when the user is not authorised to post on the PR (e.g. read-only membership)?
  - System exits non-zero with a permission-denied message without crashing.
- What happens when the network is unavailable?
  - System exits non-zero with a network error message.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to post a text reply to an existing pull request comment thread using `azdo pr comments reply <threadId> "<text>"`. The command MUST also be accessible as `azdo pr comment-reply <threadId> "<text>"` (alias); both forms are equivalent.
- **FR-002**: Users MUST be able to target a specific PR by number (`--pr-number`) instead of relying on branch-based resolution, consistent with the existing `azdo pr comments` behaviour.
- **FR-003**: The command MUST accept a `--json` flag that causes it to emit the newly created comment's details (PR number, thread ID, comment ID, content) as a JSON object on stdout.
- **FR-004**: The command MUST validate that the thread ID is a positive integer and the reply text is non-empty before making any network call, exiting non-zero with a clear message on failure.
- **FR-005**: The command MUST return a non-zero exit code and a human-readable error on stderr for all failure conditions (auth failure, thread not found, PR not found, network error, permission denied).
- **FR-006**: The command MUST print a human-readable success confirmation to stdout on a successful post (e.g. `Reply posted to thread #<id> on pull request #<pr>.`), unless `--json` is active.
- **FR-007**: The command MUST honour the global `--org` and `--project` flags consistent with all other `azdo pr` sub-commands.

### Key Entities

- **Pull Request**: An open or draft code review request identified by a numeric ID within an organisation/project/repository.
- **Comment Thread**: A conversation thread on a pull request, identified by a numeric thread ID. A thread may contain one or more comments and has a status (active, resolved, etc.).
- **Comment**: An individual reply within a thread, created by posting text content to the thread.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can post a reply to a PR comment thread in a single command invocation, without copying thread IDs into a browser or separate API tool.
- **SC-002**: The command completes and prints confirmation within the same response-time envelope as the existing read commands (no perceptible additional latency beyond the single write API call).
- **SC-003**: All failure cases produce a non-zero exit code and a stderr message that identifies what failed — users can diagnose the problem without reading source code.
- **SC-004**: The `--json` output is stable and parseable, enabling scripts to record the new comment ID without screen-scraping.

## Assumptions

- The feature targets replies to **existing threads** only; creating a new top-level thread (not attached to an existing comment) is out of scope for this iteration.
- Multi-line reply text is supported via normal shell quoting (`$'line1\nline2'` or a here-string) — no special `--multi-line` flag is needed.
- The command runs in the same authentication context as the other `azdo` commands (PAT-based or OAuth, whichever is configured).
- Thread IDs shown by `azdo pr comments` are the same IDs accepted by this command — no translation layer is needed.

## Clarifications

### Session 2026-06-15

- Q: Which command form should be canonical? → A: `azdo pr comments reply <threadId> "<text>"` is the primary (shown in `--help` and docs); `azdo pr comment-reply <threadId> "<text>"` is supported as an alias for consistency with `comment-resolve` / `comment-reopen`.
- Q: Should the reply command restrict to open/active PRs only, or any PR state? → A: Any PR state — let the server decide; surface any server-side rejection as a clear error. *(default applied after 60-min timeout; owner may revise before planning)*
