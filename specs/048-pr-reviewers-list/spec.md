# Feature Specification: `azdo pr reviewers list` — votes with reviewer identity

**Feature Branch**: `feature/048-pr-reviewers-list`
**Created**: 2026-10-01
**Status**: Approved (issue #124, owner: "proceed")
**Input**: Issue #124 — automata (alkampfergit/automata-cli#94, item F9) needs a
pull request's reviews/votes together with a *stable* reviewer identity to
follow the PR conversation. azdo-cli already reads reviewers internally (for
the `pr reviewers add|remove` no-op checks) but never exposes votes, and the
only identity it prints for a reviewer is the display name.

## Context

The `pr reviewers` group (034) has `add` and `remove`, both built on
`getPullRequestReviewers()` → `GET .../pullRequests/{id}/reviewers`. The
response (`IdentityRefWithVote[]`, verified on Microsoft Learn, API 7.1)
carries `id`, `displayName`, `uniqueName`, `isRequired`, `vote` and
`hasDeclined`; the vote is a small integer (10 / 5 / 0 / -5 / -10, plus 15
"bypassed" in the extension API). `gh pr view --json reviews` is the GitHub
equivalent the consumer is replacing.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read a PR's votes with a stable identity (Priority: P1)

An automation (or a person) asks for the reviewers of a pull request and
gets, per reviewer, who they are (`id`, `uniqueName`, `displayName`), whether
they are required, and how they voted, as a named state and as the raw number.

**Independent Test**: `tests/unit/pr-command-tree.test.ts` drives
`azdo pr reviewers list --pr-number N --json` through the real command tree
and pins the payload; `tests/unit/pr-client.test.ts` pins the vote mapping.

**Acceptance Scenarios**:

1. **Given** a PR with reviewers, **When** `azdo pr reviewers list --pr-number N --json`
   runs, **Then** stdout is `{ pullRequestId, reviewers: [...] }` and every
   entry has `id`, `displayName`, `uniqueName`, `isRequired`, `vote`,
   `voteState`, `hasDeclined`.
2. **Given** votes 10 / 5 / 0 / -5 / -10 / 15, **Then** `voteState` is
   `approved` / `approved-with-suggestions` / `no-vote` /
   `waiting-for-author` / `rejected` / `bypassed`; any other number yields
   `unknown` while `vote` still carries the number.
3. **Given** no `--pr-number`, **Then** the PR is auto-detected from the
   current branch exactly as for `pr comments` (zero/multi-match errors
   unchanged).
4. **Given** a PR with no reviewers, **Then** the human view prints
   `No reviewers on pull request #N.` and `--json` prints an empty
   `reviewers` array, both with exit 0.

### User Story 2 - Human-readable glance (Priority: P2)

Without `--json`, one line per reviewer:
`<displayName> <uniqueName> — <voteState> (required|optional[, declined])`.

## Requirements *(mandatory)*

- **FR-001**: A new `azdo pr reviewers list` subcommand MUST exist, sharing
  `--org`, `--project`, `--repo`, `--pr-number`, `--json` with the rest of
  `pr` and the same target resolution (`resolvePullRequestTarget`).
- **FR-002**: It MUST be read-only and MUST use only the reviewers endpoint
  (Code (Read) scope); it MUST NOT call the Identities API.
- **FR-003**: Each reviewer in `--json` MUST carry `id`, `displayName`,
  `uniqueName`, `isRequired`, `vote` (raw), `voteState` (named) and
  `hasDeclined`; missing optional fields map to `null` / `false` / `0`.
- **FR-004**: The vote → state table MUST live in the service layer
  (`reviewerVoteState()` in `src/services/pr-client.ts`) so any future
  consumer of `Reviewer` shares it.
- **FR-005**: `pr reviewers add|remove` output and behaviour MUST be
  unchanged (their `--json` projects explicit fields).
- **FR-006**: Errors reuse the `pr` group contract: invalid `--pr-number`
  exit 1 before any call; 401/403 on the read exit 4 with the existing
  guidance; stdout empty on failure.
- **FR-007**: `docs/commands.md` MUST document the command, the vote table
  and the JSON shape; `docs/changelogs/unreleased.md` and `AGENTS.md` MUST
  carry entries.

## Out of Scope

- Adding `reviewers` to `pr list` / `pr status` payloads (the list endpoint
  does include them, but the existing `PullRequest` JSON shape is pinned by
  several consumers; a follow-up can add it if automata wants one call).
- Casting or changing a vote (`pr reviewers vote`) — write-side, separate
  request.
- Expanding group reviewers into their members (`votedFor`).

## Success Criteria

- **SC-001**: `npm test && npm run lint` pass with the new tests.
- **SC-002**: A consumer can replace `gh pr view --json reviews` with
  `azdo pr reviewers list --pr-number N --json` and key reviewers on `id`
  or `uniqueName`.
