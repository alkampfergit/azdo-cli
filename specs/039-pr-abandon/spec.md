# Feature Specification: `azdo pr abandon` and `azdo pr reactivate`

**Feature Branch**: `feature/039-pr-abandon`
**Created**: 2026-09-16
**Status**: Draft
**Input**: GitHub issue #97 (child of #92, point 3).

## Context

`azdo pr` can create a pull request (`open`), rewrite its title and description
(`update`, shipped with #96 / 038), comment on it, resolve its threads, link
work items and manage reviewers. It cannot end one. An accidentally-created
pull request is permanent as far as the CLI is concerned — the only route out is
the web UI.

That gap is what turned a recoverable mistake into a dead end in #92: a
diagnostic call created a real pull request, and with no `abandon` the recovery
("abandon the bad PR, re-open it correctly") was not available from the CLI at
all.

Azure DevOps models this as a status change, not a deletion: the documented
`PATCH .../pullrequests/{id}` accepts `Status`, and the `PullRequestStatus`
enumeration is `notSet | active | abandoned | completed | all`. An abandoned PR
stays visible, keeps its comments and its work-item links, and can be
reactivated at any time — the web UI's own **Abandon** / **Reactivate** pair.
The `PATCH` plumbing (`updatePullRequest`) already exists from 038; this feature
adds the status field to it and two commands on top.

## User Scenarios

### US-1 — Abandon a mistaken pull request (P1)

An operator opened a pull request by mistake. They run
`azdo pr abandon --pr-number 97`. The PR's status becomes `abandoned`, the
command prints the new status, and exits 0. Nothing is deleted: the PR, its
threads and its work-item links survive.

### US-2 — Reactivate an abandoned pull request (P1)

The operator decides the change was worth keeping after all. They run
`azdo pr reactivate --pr-number 97` and the PR is active again, ready for
review.

### US-3 — Scripted, unattended use (P1)

A script abandons a PR it created for a probe. The command never prompts —
not under a TTY, not without one — because abandoning is reversible by US-2 and
a prompt would break every non-interactive caller.

### US-4 — Re-run after a retry (P2)

Automation re-runs `pr abandon` on a PR that is already abandoned. The command
reports a no-op, issues no `PATCH`, and exits 0 — the convention already used by
`pr update`, `pr work-items link` and `pr comment-resolve`.

### US-5 — A completed pull request (P2)

An operator tries to abandon a PR that has already been completed (merged).
The command fails with a message naming the PR and its actual status, and
issues no write. A completed pull request is terminal in Azure DevOps.

## Requirements

### Functional

- **FR-001** A new command `azdo pr abandon` MUST set a pull request's status to
  `abandoned` via `PATCH .../pullrequests/{id}` with body `{"status":"abandoned"}`.
- **FR-002** A new command `azdo pr reactivate` MUST set a pull request's status
  back to `active` via the same route with body `{"status":"active"}`.
- **FR-003** The two MUST be **separate subcommands**, not `pr abandon
  --reactivate` (Constitution Principle III — a flag that inverts a command's
  meaning is two commands wearing one name).
- **FR-004** Both MUST accept `--pr-number <N>`. When it is omitted, `abandon`
  MUST resolve the current branch's single **active** pull request, and
  `reactivate` MUST resolve the current branch's single **abandoned** pull
  request (searching for an active PR would never find a reactivation target).
  Zero or multiple matches MUST fail (exit 1) with a message naming the searched
  branch and the status searched for.
- **FR-005** The body MUST carry **only** `status`. No other property of the
  fetched pull request is echoed back, for the reason documented in 038: Azure
  DevOps either throws or silently ignores properties outside the updatable set.
- **FR-006** When the pull request is already in the requested status, the
  command MUST report a no-op, issue **no** `PATCH`, and exit 0. `--json` MUST
  carry `noop: true`.
- **FR-007** A `completed` pull request MUST NOT be abandoned or reactivated.
  The command MUST fail (exit 1) naming the pull request and its actual status,
  before any write. Should the server reject a status change the CLI did not
  predict, the server's own message MUST reach the operator (the 037 error
  surfacing already does this).
- **FR-008** Neither command MUST ever prompt for confirmation, under a TTY or
  otherwise (US-3).
- **FR-009** Both MUST accept the group-wide `--org`, `--project`, `--repo` and
  `--json` options and honour the `pr` group's exit-code contract (1 validation,
  3 not found, 4 not permitted).
- **FR-010** `--json` output MUST be a flat object:
  `{ pullRequestId, title, status, previousStatus, url, noop }`.
- **FR-011** `abandon` MUST carry the alias `close`, the verb the Azure DevOps
  documentation itself uses for it ("Abandon: Close the PR") and the one `gh`
  users expect. It does **not** mean complete/merge, and the help text MUST say so.

### Non-functional

- **NFR-001** No new runtime dependencies.
- **NFR-002** The status change MUST reuse the existing `updatePullRequest()`
  transport rather than adding a second `PATCH` helper.
- **NFR-003** The no-op and the completed-PR check MUST cost no extra API call —
  `resolvePullRequestTarget` already fetches the pull request, and
  `mapPullRequest` already projects `status`.

## Out of Scope

- **Completing / merging a pull request** (`status: "completed"`, completion
  options, squash, delete-source-branch, auto-complete). Completion is
  irreversible and carries a policy-bypass surface; it deserves its own spec.
- `isDraft` (mark as draft / publish), labels, `targetRefName` retargeting.
- Deleting a pull request (Azure DevOps has no such operation).
- Any confirmation prompt or `--yes` flag (FR-008 rules them out).
- Cascading actions on abandon (deleting the source branch, unlinking work
  items, resolving threads).

## Acceptance

- `azdo pr abandon --pr-number N` sets the status to `abandoned` and reports it.
- `azdo pr reactivate --pr-number N` restores an abandoned PR to `active`.
- Re-running either on a PR already in the target status is a no-op
  (`noop: true` in `--json`, no `PATCH` issued, exit 0).
- A completed PR cannot be abandoned: exit 1, no write, message naming the
  actual status; an unexpected server rejection is surfaced with the server's
  own message.
- Neither command prompts.
- `docs/commands.md` (the repository has no `docs/pr.md`; the pull request
  section lives there) documents both commands, the no-op rule, the completed-PR
  rule and the JSON shape.

## Open decisions — resolved

| Decision (from issue #97) | Resolution |
| --- | --- |
| Separate `pr reactivate` vs `pr abandon --reactivate` | **Two subcommands.** Principle III; a flag that reverses the verb makes `--json`/help/exit-code documentation ambiguous. (FR-003) |
| Abandoning an already-abandoned PR | **No-op**, `noop: true`, exit 0 — the convention every other idempotent `pr` write already follows. (FR-006) |
| Confirmation prompt | **None.** Abandon is reversible via `reactivate`, and prompting breaks scripted use. (FR-008) |
| Branch auto-detection for `reactivate` | Searches **abandoned** PRs for the branch, not active ones. (FR-004) |
