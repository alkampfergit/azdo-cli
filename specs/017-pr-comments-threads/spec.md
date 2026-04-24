# Feature Specification: Reliable access and management of PR comment threads

**Feature Branch**: `017-pr-comments-threads`
**Created**: 2026-04-23
**Status**: Draft
**Input**: GitHub issue #34 — "Bug: Can't get the comments for a pr"

> When `azdo pr comments` is run, it currently crashes instead of showing the
> comment threads on the pull request. The command should also gain a way to
> target a specific pull request by number (not just the active branch's PR),
> and operators would like to resolve and reopen comment threads directly
> from the CLI. The work is motivated by a real operator workflow: reading
> and triaging PR discussion from the terminal without jumping to the web UI.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - List comment threads on the current branch's PR without crashing (Priority: P1)

As an operator on a working branch with an open pull request, I run
`azdo pr comments` and get a clean, readable listing of the pull request's
comment threads — including threads that only have a single comment and
threads with multiple replies. The command finishes successfully, with a
zero exit code, and produces no stack trace, internal error message, or
abnormal termination.

**Why this priority**: This is the reported bug (#34) — the command is
currently unusable. Restoring it is a pre-requisite for everything else in
this feature.

**Independent Test**: On a branch whose pull request has at least one comment
thread, running `azdo pr comments` completes successfully and shows each
thread once. Exit code is 0. The behaviour is covered by an integration test
that exercises a real pull request on the project's test Azure DevOps
organisation (PR #64 in the test project, which has two user comments, is
available for this purpose).

**Acceptance Scenarios**:

1. **Given** the current branch has an open pull request with at least one
   comment thread, **when** the operator runs `azdo pr comments`, **then**
   the command prints each thread on the pull request and exits with status
   0, with no crash, assertion, or stack trace.
2. **Given** the current branch has an open pull request with zero comment
   threads, **when** the operator runs `azdo pr comments`, **then** the
   command prints a clear "no comments" message and exits with status 0.
3. **Given** the current branch has no open pull request, **when** the
   operator runs `azdo pr comments`, **then** the command prints a concise
   "no active pull request for this branch" message and exits with a
   non-zero status — it does NOT crash.
4. **Given** a comment thread whose metadata is partially populated (for
   instance, an author without an avatar, or a comment without a rendered
   web link), **when** the operator runs `azdo pr comments`, **then** the
   thread is still shown; missing fields are rendered as a safe placeholder
   (e.g. `—` or omitted) rather than triggering a crash.

---

### User Story 2 - Target any pull request by number with `--pr-number` (Priority: P2)

As an operator who wants to read a pull request's discussion without first
checking out the PR's branch, I run `azdo pr comments --pr-number <N>` and
get the comment threads for PR `<N>`, regardless of which branch is
currently checked out.

**Why this priority**: Reviewers, release captains, and ops rarely switch
branches just to read comments. This flag removes that friction and is also
the mode the integration test will exercise (against a known PR number).

**Independent Test**: With any branch checked out (even one that has no
pull request), running `azdo pr comments --pr-number <N>` lists the comment
threads on PR `<N>` in the same format as user story 1, and exits 0.

**Acceptance Scenarios**:

1. **Given** an operator on a branch that does not map to any PR, **when**
   they run `azdo pr comments --pr-number 64`, **then** the comment threads
   on PR 64 are shown and the command exits 0.
2. **Given** an operator provides `--pr-number` for a PR that does not exist
   in the target project, **when** the command runs, **then** it prints a
   clear "PR not found" message and exits with a non-zero status (no crash).
3. **Given** an operator provides `--pr-number` with a non-integer or
   negative value, **when** the command runs, **then** it prints a validation
   error describing the expected format and exits with a non-zero status.
4. **Given** an operator provides `--pr-number` **and** is also on a branch
   that itself maps to a different PR, **when** the command runs, **then**
   the explicit flag wins — the output is for the PR given on the flag, not
   the branch's PR.

---

### User Story 3 - Resolve and reopen a comment thread (Priority: P3)

As an operator triaging PR feedback from the terminal, I can change the
state of a single comment thread — marking it resolved when the feedback
has been handled, or reopening a previously closed thread when follow-up
work is needed — without leaving the CLI.

**Why this priority**: This is the "nice to have" stretch asked for in the
issue. The underlying read path (stories 1 and 2) must work first; thread
state changes layer on top.

**Independent Test**: The operator picks a comment thread visible in the
output of `azdo pr comments`, runs a resolve command against it, re-runs
`azdo pr comments`, and sees the thread's state change. Running the reopen
command reverses the change.

**Acceptance Scenarios**:

1. **Given** a thread currently shown as active on a PR, **when** the
   operator runs the resolve command for that thread, **then** re-running
   `azdo pr comments` shows the thread as resolved, and the command exits 0.
2. **Given** a thread currently shown as resolved on a PR, **when** the
   operator runs the reopen command for that thread, **then** re-running
   `azdo pr comments` shows the thread as active again, and the command
   exits 0.
3. **Given** an operator tries to resolve a thread that is already
   resolved (or reopen one that is already active), **when** the command
   runs, **then** it reports that the thread was already in the desired
   state and exits 0 (no-op success), without making a redundant backend
   call.
4. **Given** `--pr-number` is supplied alongside the resolve/reopen command,
   **when** the command runs, **then** the target PR is the one on the flag,
   not the branch's PR.

---

### Edge Cases

- Operator runs the command while not signed in to any Azure DevOps
  organisation → clear "run `azdo auth login` first" message, non-zero exit,
  no crash.
- Target PR is in a state where comments are visible but locked (for
  example a completed or abandoned PR) → the read path still succeeds
  read-only; resolve/reopen returns a clear "thread is locked" message.
- Thread state vocabulary from the backend includes values beyond "active"
  and "resolved" (for example "won't fix", "pending", "closed"). The
  read command MUST show each thread's actual state verbatim; the resolve
  and reopen commands target only the "active ↔ resolved" transitions.
- A PR with many threads (e.g. 50+) still renders in a single pass;
  operators should not need pagination flags for typical sizes.
- The crash reported in #34 includes a libuv async-handle assertion on
  Windows pwsh; the fix MUST ensure graceful process shutdown on both the
  success path and the error paths on every platform the CLI already
  supports.

## Requirements *(mandatory)*

### Functional Requirements

#### Read path (fixes #34)

- **FR-001**: The CLI command `azdo pr comments` MUST return comment threads
  for the pull request associated with the current branch without throwing
  an uncaught error, stack trace, or runtime assertion, and MUST exit 0 on
  success.
- **FR-002**: The command MUST tolerate optional or missing fields in a
  comment thread (author display metadata, rendered links, inline-file
  context) and still list the thread.
- **FR-003**: The command MUST distinguish in its output between *active*
  and *resolved* threads, so that operators can triage at a glance, by
  rendering a short status indicator (e.g. `[active]` / `[resolved]`) next
  to each thread title.
- **FR-004**: The command MUST exit with a non-zero status (and no crash)
  when run outside the context of any pull request — i.e. no branch PR and
  no explicit `--pr-number`.
- **FR-004a**: The command MUST accept an optional filter flag that
  excludes *resolved* threads from the output (leaving active and any other
  non-resolved threads visible), so that operators can focus on threads
  that still need attention. Default behaviour (no flag) shows every
  thread.

#### `--pr-number` flag (new)

- **FR-005**: The command MUST accept an optional `--pr-number <N>` flag
  which overrides current-branch PR resolution and targets PR `<N>` in the
  configured project.
- **FR-006**: `--pr-number` MUST be validated as a positive integer; invalid
  values cause a validation error with a non-zero exit and no crash.
- **FR-007**: When `--pr-number` refers to a PR that does not exist in the
  configured project, the command MUST report "PR not found" and exit with
  a non-zero status.
- **FR-008**: When `--pr-number` is supplied, the current-branch resolution
  path MUST be skipped entirely — no git branch introspection occurs.

#### Resolve / reopen (new, nice-to-have stretch)

- **FR-009**: The CLI MUST provide a way to **resolve** a specific comment
  thread on a pull request, identified by thread id, targeting either the
  current branch's PR or a PR given by `--pr-number`.
- **FR-010**: The CLI MUST provide a way to **reopen** a previously
  resolved comment thread on a pull request, targeting either the current
  branch's PR or a PR given by `--pr-number`.
- **FR-011**: Resolve and reopen commands MUST be idempotent: attempting to
  resolve a thread that is already resolved, or reopen one that is already
  active, reports that the thread is already in the desired state, makes
  no redundant backend call, and exits 0 (no-op success).
- **FR-012**: On success, the resolve/reopen commands MUST return a clear
  confirmation identifying the thread and its new state, and exit 0.

#### Quality / integration testing

- **FR-013**: The fix for the read path MUST be covered by an **integration
  test** that runs against a real pull request on the project's test Azure
  DevOps organisation. The canonical target is PR #64 in the test project,
  which carries two user-authored comments.
- **FR-014**: The integration test MUST confirm, at minimum, that the
  command exits 0 and returns a non-empty listing of threads/comments for
  the target PR, and MUST run as part of the existing integration-test
  suite (not silently skipped).
- **FR-015**: The integration test MUST be gated so that it can be
  executed only in an environment with valid test credentials; it must not
  fail or block CI in environments where those credentials are deliberately
  absent.

### Key Entities *(include if feature involves data)*

- **Pull request**: A unit of proposed change in a project; identified by
  a numeric id within the project.
- **Comment thread**: A grouping of one or more comments attached to a pull
  request; carries a *state* (e.g. active, resolved, and possibly others
  returned by the backend) and a *location* (overview-level or tied to a
  specific file / line range).
- **Comment**: A single authored message inside a thread; carries an
  author, timestamp, body text, and optional rendered link / attachments.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a pull request with 1–20 comment threads, a single
  invocation of `azdo pr comments` prints the full listing in under 2
  seconds in 95% of runs and exits 0, measured against the test
  organisation's PR #64 (baseline) and a second reference PR with a
  representative thread count.
- **SC-002**: 100% of invocations of `azdo pr comments` (and its
  resolve/reopen variants) terminate cleanly — no abnormal termination,
  no internal stack trace, and no non-zero exit other than the documented
  validation / "not found" / "no PR" cases — across the supported
  platforms (macOS, Linux, Windows).
- **SC-003**: Using `--pr-number <N>` from a branch with no associated PR
  completes successfully for a PR that exists, and fails cleanly (non-zero,
  clear message) for a PR that does not — verified by an automated test
  covering both paths.
- **SC-004**: An operator can resolve or reopen a thread and verify the
  new state via a subsequent `azdo pr comments` in under 10 seconds of
  hands-on time, with no web-UI round trip.
- **SC-005**: The automated integration test for the read path (FR-013)
  runs as part of the normal integration test suite on at least one
  supported platform and exercises PR #64 end-to-end.

## Assumptions

- The crash's proximate cause is an unchecked lookup on an optional
  response field (the `web` link on a comment or thread), combined with an
  unhandled asynchronous cleanup path on Windows. The spec targets the
  *symptoms* (clean exit, tolerant rendering); the exact code site is a
  plan-phase concern.
- The resolve/reopen feature operates on the backend's thread-state
  vocabulary. For the purposes of this feature, "resolve" maps to the
  backend's "resolved / fixed" state and "reopen" maps to "active". Other
  backend states (e.g. "won't fix", "pending", "closed") are visible in
  listings but are out of scope for CLI-driven transitions in this
  iteration.
- Integration tests against the test Azure DevOps organisation will use
  the existing test credential setup; this feature does not introduce new
  credential mechanisms.
- The feature targets the already-supported CLI platforms (macOS, Linux,
  Windows). No new platform support is introduced.

## Clarifications

- Q: Exact rendering of active vs. resolved threads in the `azdo pr comments` output — column, coloured tag, trailing annotation, or something else? → A: a short status indicator (e.g. `[active]` / `[resolved]`) next to each thread title is fine as the default, and the command should also accept an optional filter flag to hide *resolved* threads entirely for triage. [owner: alkampfergit, 2026-04-23]
- Q: Behaviour when resolve/reopen is issued on a thread already in the target state — no-op success, informational warning, or outright error? → A: no warning; exit 0 with a message stating the thread was already in the desired state. [owner: alkampfergit, 2026-04-23]

## Out of scope

- Creating new comment threads from the CLI (read + state transitions only
  in this iteration).
- Replying to, editing, or deleting individual comments.
- Web-UI parity for rich content in comment bodies (inline images,
  mentions, emoji reactions); plain-text rendering is sufficient.
- Tagging or releasing on merge of the feature PR — out of scope per
  gitflow.
