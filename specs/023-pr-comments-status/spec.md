# Feature Specification: Better support for commenting in the pull request

**Feature Branch**: `023-pr-comments-status`  
**Created**: 2026-06-03  
**Status**: Draft  
**Input**: User description: "Better support for commenting in the pull request. Improve azdo PR commenting and status: (1) `azdo pr status` reports no checks are present even though green checks run; (2) the output of `azdo pr comments` is confusing because many comments are not bound to code lines — add `--code-related-only` and `--exclude-resolved` flags; (3) in `azdo pr status` show a count of opened and closed comments, counting only code (file-anchored) comments."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Status checks are actually shown (Priority: P1)

A reviewer runs `azdo pr status` on a pull request that has status checks
(build/CI validations) running or completed. Today the command reports
that no checks are present even when there are green (succeeded) checks on
the PR. The reviewer needs the command to faithfully list the checks that
Azure DevOps reports for the pull request, with their state.

**Why this priority**: This is a correctness defect — the command is
actively misleading. A reviewer who trusts the output may believe a PR has
no validation when it is in fact green (or red). Restoring trust in the
core status output is the most critical item.

**Independent Test**: Run `azdo pr status` against a PR known to have at
least one completed status check and confirm the command lists that check
and its state instead of "no checks".

**Acceptance Scenarios**:

1. **Given** a pull request that has one or more status checks reported by
   Azure DevOps (e.g. a succeeded build validation), **When** the user runs
   `azdo pr status` for that PR, **Then** the command lists each check with
   its name and outcome (e.g. succeeded/failed/pending) and does NOT claim
   that no checks are present.
2. **Given** a pull request that genuinely has no status checks configured,
   **When** the user runs `azdo pr status`, **Then** the command clearly
   states that no checks are present (the "no checks" message is reserved
   for the genuinely-empty case only).
3. **Given** a pull request with a mix of succeeded and pending/failed
   checks, **When** the user runs `azdo pr status`, **Then** every reported
   check appears with its correct individual state.

---

### User Story 2 - Filter PR comments to what matters (Priority: P1)

A reviewer runs `azdo pr comments` and is overwhelmed because the output
mixes general discussion threads (not tied to any code) with threads
anchored to specific files/lines, and it also includes threads that have
already been resolved. The reviewer wants two independent opt-in filters:
show only code-anchored comments, and/or hide resolved threads.

**Why this priority**: This is the primary usability complaint in the
issue. The two filters are independent and each delivers value on its own,
making the command usable for code-review triage.

**Independent Test**: On a PR that has both file-anchored and
non-file-anchored threads, and both resolved and unresolved threads, run
`azdo pr comments` with each new flag and confirm the output is filtered
accordingly.

**Acceptance Scenarios**:

1. **Given** a PR with both code-anchored threads and general (non-code)
   threads, **When** the user runs `azdo pr comments --code-related-only`,
   **Then** only threads anchored to a real file/line are shown and general
   discussion threads are omitted.
2. **Given** a PR with both resolved and unresolved threads, **When** the
   user runs `azdo pr comments --exclude-resolved`, **Then** resolved
   threads are omitted and only unresolved (open) threads remain.
3. **Given** the same PR, **When** the user combines
   `--code-related-only --exclude-resolved`, **Then** only unresolved
   code-anchored threads are shown.
4. **Given** the user runs `azdo pr comments` with neither new flag,
   **Then** the output is unchanged from today's behaviour (the flags are
   opt-in and default to off).

---

### User Story 3 - Comment counts in the status overview (Priority: P2)

A reviewer running `azdo pr status` wants an at-a-glance count of how many
code (file-anchored) comments are open versus closed, so they can judge how
much review feedback is still outstanding without scrolling through the
full comments list.

**Why this priority**: This is a convenience summary that builds on the
same code-vs-general distinction as Story 2. It is valuable but secondary
to the two correctness/usability items above.

**Independent Test**: On a PR with a known number of open and closed
code-anchored comment threads, run `azdo pr status` and confirm the
reported open/closed code-comment counts match.

**Acceptance Scenarios**:

1. **Given** a PR with code-anchored comment threads in both open and
   resolved states, **When** the user runs `azdo pr status`, **Then** the
   output includes a count of open code comments and a count of closed
   (resolved) code comments.
2. **Given** a PR whose only comment threads are general (non-code),
   **When** the user runs `azdo pr status`, **Then** the code-comment
   counts are reported as zero (general threads are excluded from the
   count).
3. **Given** a PR with no comment threads at all, **When** the user runs
   `azdo pr status`, **Then** the counts are reported as zero without error.

---

### Edge Cases

- A thread that has comments but no file/line anchor → treated as a general
  (non-code) thread: excluded by `--code-related-only` and excluded from the
  code-comment counts.
- A thread anchored to a file that no longer exists in the latest iteration
  (deleted file) → still counts as a code-anchored thread (it carries a file
  context), unless clarified otherwise.
- A thread in a state that is neither clearly "active/open" nor "resolved"
  (e.g. pending, won't-fix, closed-by-default) → must map deterministically
  to either the open or closed bucket for counting and for
  `--exclude-resolved`.
- A PR with checks the user is not authorised to see, or where the checks
  data returns an error → the command must not silently report "no checks";
  it should distinguish "genuinely none" from "could not retrieve".
- Machine-readable (JSON) output mode, if supported, must carry the same
  filtered set and the same counts as the human-readable output.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `azdo pr status` MUST list every status check that Azure
  DevOps reports for the pull request, each with its name and individual
  state, whenever at least one check exists.
- **FR-002**: `azdo pr status` MUST report "no checks" only when the pull
  request genuinely has zero status checks, and MUST distinguish that case
  from a failure to retrieve check data.
- **FR-003**: `azdo pr comments` MUST accept a `--code-related-only` flag
  that, when set, restricts the output to threads anchored to a specific
  file/line and omits general (non-file-anchored) threads.
- **FR-004**: `azdo pr comments` MUST accept an `--exclude-resolved` flag
  that, when set, omits threads in a resolved state and shows only
  unresolved (open) threads.
- **FR-005**: The two flags MUST be independent and combinable; using both
  yields only unresolved code-anchored threads.
- **FR-006**: Both flags MUST default to off — omitting them preserves the
  current `azdo pr comments` output and behaviour (no regression).
- **FR-007**: `azdo pr status` MUST display a count of open code comments
  and a count of closed/resolved code comments, where "code comment" means
  a thread anchored to a file/line.
- **FR-008**: The comment counts in `azdo pr status` MUST exclude general
  (non-file-anchored) threads.
- **FR-009**: The system MUST classify each thread deterministically as
  open or closed for both `--exclude-resolved` and the status counts, using
  a consistent mapping of Azure DevOps thread states.
- **FR-010**: If the project supports machine-readable (JSON) output for
  these commands, the filtered comment set and the new counts MUST be
  reflected there as well, not only in human-readable output.
- **FR-011**: The new flags and counts MUST be documented in the command
  help text and the user-facing docs.

### Key Entities *(include if feature involves data)*

- **PR status check**: A validation reported by Azure DevOps against the
  pull request (e.g. a build/CI run or policy evaluation), with a name and a
  state (e.g. succeeded, failed, pending).
- **Comment thread**: A discussion on the pull request. May be
  *code-anchored* (tied to a specific file and line) or *general* (no file
  context). Has a state that maps to open or closed/resolved.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any PR that has at least one status check, `azdo pr
  status` shows 100% of the reported checks and never displays "no checks"
  — verified against PRs with green, red, and mixed check states.
- **SC-002**: With `--code-related-only`, the comments output contains only
  file-anchored threads (zero general threads) on a PR that mixes both.
- **SC-003**: With `--exclude-resolved`, the comments output contains zero
  resolved threads on a PR that mixes resolved and unresolved threads.
- **SC-004**: The open/closed code-comment counts reported by `azdo pr
  status` exactly match the number of open and resolved file-anchored
  threads on the PR.
- **SC-005**: Running `azdo pr comments` with no new flags produces output
  identical to the prior release (no behavioural regression).

## Assumptions

- "Code comment" / "code-related" means a thread that carries a file/line
  anchor (thread context), as opposed to a general PR discussion thread.
- "Resolved" maps to Azure DevOps thread states that represent completion
  (e.g. fixed/closed/won't-fix); "open" maps to active/pending states. The
  exact state-to-bucket mapping is confirmed during clarification/plan.
- The new flags are opt-in filters layered on the existing `azdo pr
  comments` command; they do not change defaults.
- The status-check defect is a data-surfacing bug in how the existing `azdo
  pr status` reads/displays the checks Azure DevOps already returns, not a
  request for a new checks source or provider.
- These changes are CLI-surface and presentation improvements; no new
  external service integration is introduced.
