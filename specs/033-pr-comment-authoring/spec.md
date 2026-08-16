# Feature Specification: PR Comment Authoring & Pull Request Lookup

**Feature Branch**: `033-pr-comment-authoring`  
**Created**: 2026-08-16  
**Status**: Implemented  
**Input**: User description: "Bring the four PowerShell helper scripts (`add_pr_comment.ps1`, `update_pr_comment.ps1`, `get_pr_comments.ps1`, `find_pr_for_branch.ps1`) into the CLI, following the repository's own patterns instead of keeping ad-hoc scripts."

## Context

Four PowerShell scripts under `scripts/` covered pull request operations the CLI could not do:
posting a **new** comment thread, **editing** an existing comment in place, reading a known PR's
comments with truncation and system-comment filtering, and finding the PR of a given branch. They
hardcoded one organisation/project/repository, authenticated through a separate `AZDO_WI_PAT`
variable, and duplicated logic that already exists in `src/services/pr-client.ts`.

No other Azure DevOps capability in this repository ships as a script: every one is an `azdo`
subcommand. This feature closes that gap and removes the scripts.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Post a new comment thread on a pull request (Priority: P1)

An engineer or coding agent has produced a review plan, a build report, or a status update in a
markdown file and needs it on the pull request **overview** as a new discussion thread — not as a
reply to an existing one, which is all the CLI could do before.

**Why this priority**: This is the capability with no workaround at all in the CLI, and the one the
deleted `add_pr_comment.ps1` existed for.

**Independent Test**: Run `azdo pr comments add --file plan.md --pr-number <N>` and confirm a new
thread appears on the PR overview with the file's content.

**Acceptance Scenarios**:

1. **Given** an authenticated user with a PR on the current branch, **When** they run
   `azdo pr comments add "text"`, **Then** a new thread is created on that PR and the CLI prints the
   new thread id.
2. **Given** a markdown file, **When** they run `azdo pr comments add --file body.md --pr-number <N>`,
   **Then** the file's content is posted verbatim (trailing whitespace trimmed) to PR `<N>`.
3. **Given** `--dry-run`, **When** the command runs, **Then** the target pull request is resolved,
   the body that *would* be posted is printed, nothing is written, and the exit code is 0.
4. **Given** `--status <s>` with a valid thread status, **When** the thread is created, **Then** it
   carries that status; **and given** no `--status`, **Then** the thread is a plain, non-resolvable
   overview comment.

---

### User Story 2 - Correct a comment already posted (Priority: P1)

An agent posted a plan or report and needs to correct it. A follow-up comment would read as a new
version; editing keeps the thread, its id, and its position in the discussion.

**Why this priority**: Equal to US1 — the "revise your own post" loop is unusable without it, and
`update_pr_comment.ps1` existed solely for this.

**Independent Test**: Run `azdo pr comments edit <threadId> --file v2.md --pr-number <N>` and confirm
the original comment's body changed while the thread id stayed the same.

**Acceptance Scenarios**:

1. **Given** a thread the caller authored, **When** they run `azdo pr comments edit <threadId> "new text"`,
   **Then** the thread's **first** comment is rewritten in place.
2. **Given** `--comment-id <id>`, **When** the command runs, **Then** that specific comment is edited.
3. **Given** a comment authored by somebody else, **When** the edit is attempted, **Then** Azure DevOps
   rejects it and the CLI reports a permission error with a non-zero exit code.
4. **Given** `--dry-run`, **When** the command runs, **Then** the current and replacement lengths and
   the new body are printed and nothing is written.

---

### User Story 3 - Read a known pull request's discussion compactly (Priority: P2)

A reviewer or agent wants the human discussion of a PR without the Azure DevOps system chatter
(branch updates, reviewer votes, build events) and without pulling long review essays into a limited
context window.

**Why this priority**: `azdo pr comments --pr-number <N>` already reads a PR's threads; only the
noise-reduction controls of `get_pr_comments.ps1` were missing.

**Independent Test**: Run `azdo pr comments --pr-number <N> --exclude-system --max-chars 500` and
confirm system entries are gone and long bodies end with ` […]`.

**Acceptance Scenarios**:

1. **Given** a PR with system threads, **When** `--exclude-system` is passed, **Then** threads whose
   only comments are system-generated disappear and mixed threads keep just their human comments.
2. **Given** `--max-chars N` with N > 0, **When** a comment is longer than N, **Then** it is cut to N
   characters followed by ` […]` in both human-readable and `--json` output.
3. **Given** neither flag, **When** the command runs, **Then** the output is byte-identical to the
   previous release.

---

### User Story 4 - Find the pull request for a branch (Priority: P2)

Someone needs the PR id for a branch — usually to feed it to another command — without the cost and
noise of `pr status`, which fetches checks, policy evaluations, and builds for every match.

**Why this priority**: `pr status` covers the current branch only; scripting against any other branch
had no CLI path, which is why `find_pr_for_branch.ps1` existed.

**Independent Test**: Run `azdo pr list --branch <branch> --json` and confirm the id, title, source
and target branches, author, and URL come back from a single request.

**Acceptance Scenarios**:

1. **Given** no `--branch`, **When** `azdo pr list` runs, **Then** the repository's active pull
   requests are listed (never implicitly the current branch — that is `pr status`).
2. **Given** `--branch <name>` with or without a `refs/heads/` prefix, **When** the command runs,
   **Then** only PRs opened from that source branch are listed.
3. **Given** `--status completed|abandoned|all`, **When** the command runs, **Then** the filter is
   applied server-side; an unknown value fails before any network call.

---

### User Story 5 - Operate on a repository other than the checkout (Priority: P3)

The deleted scripts took a `-Repository` parameter; every `pr` subcommand derived the repository from
the git `origin` remote instead, so none of them worked from outside a checkout of the target repo.

**Independent Test**: Run any `pr` subcommand with `--repo <name>` from an unrelated directory and
confirm it targets that repository.

**Acceptance Scenarios**:

1. **Given** `--repo <name>` on any `pr` subcommand, **When** it runs, **Then** the git remote lookup
   is skipped entirely and `<name>` is used.
2. **Given** no `--repo`, **When** it runs, **Then** the repository is derived from `origin` exactly
   as before.

---

### Edge Cases

- Body supplied both inline and via `--file` → rejected before any network call.
- `--file` pointing at a missing or unreadable path → rejected with the path in the message.
- A body that is empty or whitespace-only (inline or from a file) → rejected; the CLI never blanks an
  existing comment.
- A thread whose comments are all system-generated under `--exclude-system` → the thread disappears
  rather than printing an empty header.
- `--max-chars 0` → explicitly means "no limit", matching the default.
- `pr list` on a busy repository → capped by `--top` (default 25) so the output stays readable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `azdo pr comments add [text]` MUST create a new comment thread on the target PR's
  overview, taking the body inline or from `--file`, and MUST print the created thread id.
- **FR-002**: `azdo pr comments add` MUST accept an optional `--status` from
  `active | fixed | wontFix | closed | byDesign | pending`, rejecting anything else before any
  network call; omitting it MUST create a plain, non-resolvable comment.
- **FR-003**: `azdo pr comments edit <threadId> [text]` MUST rewrite an existing comment in place,
  defaulting to the thread's first comment and honouring `--comment-id` when given.
- **FR-004**: Both authoring commands MUST support `--dry-run`, resolving the target, printing what
  would be sent, and exiting 0 without performing the write.
- **FR-005**: `azdo pr comments reply` MUST accept `--file` as an alternative to its inline text
  argument, with the same mutual-exclusion rules.
- **FR-006**: `azdo pr comments` MUST support `--exclude-system` and `--max-chars <N>`; with neither
  flag its output MUST be unchanged.
- **FR-007**: `azdo pr list` MUST list a repository's pull requests with optional `--branch`,
  `--status` (default `active`), and `--top` (default 25) filters, in one API call.
- **FR-008**: Every `pr` subcommand MUST accept `--repo <name>`, bypassing the `origin` lookup.
- **FR-009**: Every new command MUST support `--json`, `--org`, and `--project` like the rest of the
  CLI, and MUST write errors to stderr with a non-zero exit code.
- **FR-010**: The mapped pull request MUST carry the PR `description`, exposed through `--json`.
- **FR-011**: The four PowerShell scripts MUST be deleted; no Azure DevOps capability ships as a
  script in this repository.

### Key Entities

- **Comment thread** — a PR discussion thread; created by `comments add`, targeted by id everywhere else.
- **Comment** — one message inside a thread, identified by `commentId`, carrying a `commentType`
  (`text` / `system`) used by `--exclude-system`.
- **Pull request** — now also carries `description`, which `pr list --json` and `pr comments --json` expose.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every capability of the four deleted scripts is reachable through `azdo pr` subcommands.
- **SC-002**: `scripts/` contains no `.ps1` file.
- **SC-003**: Existing `pr` command output is unchanged when none of the new flags is passed.
- **SC-004**: `pr list` issues exactly one Azure DevOps request per invocation.
- **SC-005**: `npm test` passes, including new unit coverage for every new command and flag.

## Assumptions

- The identity behind the credential is the comment author; Azure DevOps only allows an author to
  edit their own comment, and the CLI surfaces that rejection rather than trying to work around it.
- Thread statuses beyond `active` / `fixed` remain settable only at creation time (`comments add
  --status`); flipping an existing thread stays limited to `comment-resolve` / `comment-reopen`, as
  established in 023.
- The separate `AZDO_WI_PAT` variable used by the scripts is not carried over: the CLI already reads
  `AZDO_PAT` and the OS credential store, and callers who need a distinct token can set `AZDO_PAT`
  for the invocation.

## Clarifications

### Session 2026-08-16

- Q: How should the PowerShell scripts be reworked? → A: Not reworked — this repository ships Azure
  DevOps functionality as CLI commands only, so the scripts are deleted and their behaviour becomes
  `azdo pr` subcommands.
- Q: How is "find the PR for a branch" covered? → A: A new lightweight `azdo pr list`, not an
  extension of `pr status` (which stays the current-branch, checks-included overview).
- Q: Should `--repo` be added? → A: Yes, on the whole `pr` group, so the commands work outside a
  checkout of the target repository.
- Q: Keep the scripts' `-DryRun`? → A: Yes, as `--dry-run` on the two write commands. It is the one
  affordance without precedent in the repository, kept because previewing a public PR write is worth
  the small surface.
