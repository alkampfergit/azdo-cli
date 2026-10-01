# Feature Specification: Bulk PR ↔ work item read in `azdo pr list`

**Feature Branch**: `feature/047-pr-list-bulk-fields`
**Created**: 2026-10-01
**Status**: Approved (issue #122, owner: "proceed")
**Input**: Issue #122 — automata (alkampfergit/automata-cli#94, item F7) needs
"which open PRs close which work items" plus draft/date/reviewer/label state in
one call, to build its PR ↔ work item map, run the orphan-PR pass and do branch
hygiene. Replaces gh GraphQL `pullRequests { closingIssuesReferences, isDraft,
labels, assignees, updatedAt }`.

## Grounding (Azure DevOps REST 7.1)

- `GET .../pullrequests` returns `GitPullRequest` with `isDraft`,
  `creationDate`, `closedDate`, `reviewers` (`IdentityRefWithVote`: `uniqueName`,
  `vote`, `isRequired`) and `labels` (`WebApiTagDefinition`: `name`, `active`).
- It does **not** return `workItemRefs`; those come from
  `GET .../pullRequests/{id}/workitems` (one call per PR).
- `GitPullRequest` has **no** last-updated timestamp. None is invented.
- Azure DevOps has no PR assignees; reviewers are the nearest equivalent.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - PR review state in `--json` (Priority: P1)

A script runs `azdo pr list --json` and gets, for each PR, `isDraft`,
`creationDate`, `closedDate`, `reviewers` (with `uniqueName` and `vote`) and
`labels` — no extra calls.

**Acceptance Scenarios**:

1. **Given** a draft PR with two reviewers and an inactive label, **When**
   `pr list --json` runs, **Then** `isDraft` is `true`, each reviewer carries
   `id`/`displayName`/`uniqueName`/`isRequired`/`vote`, and `labels` holds only
   active label names.
2. **Given** an active PR, **Then** `closedDate` is `null`.

### User Story 2 - Linked work items in one invocation (Priority: P1)

`azdo pr list --work-items --json` adds `workItemIds` to every PR.

**Acceptance Scenarios**:

1. **Given** PRs with and without linked work items, **Then** each carries
   sorted `workItemIds`, `[]` when none, in the list's order.
2. **Given** no `--work-items`, **Then** no work item lookup is made and the
   field is absent.
3. **Given** a 401/403 on a lookup, **Then** stdout is empty and the existing
   Code (Read) guidance and exit code 4 apply.

## Requirements *(mandatory)*

- **FR-001**: The shared PR mapping MUST carry `isDraft` (default `false`),
  `creationDate`, `closedDate` (null when absent), `reviewers` and active
  `labels` names. Additive: no existing field changes.
- **FR-002**: `pr list` MUST accept `--work-items`; with it, each PR MUST carry
  `workItemIds: number[]` from `GET .../pullRequests/{id}/workitems`.
- **FR-003**: Lookups MUST be bounded (≤5 in flight) and preserve list order.
- **FR-004**: Text output MUST mark drafts (`[active, draft]`) and, with
  `--work-items`, print a `Work items:` line.
- **FR-005**: `docs/commands.md` MUST document the option and the JSON fields.

## Out of Scope

- A last-updated timestamp (not in the Azure DevOps model).
- A separate `pr work-items list` command (the flag on `pr list` covers the bulk need).
- README changes.

## Success Criteria

- **SC-001**: `npm test && npm run lint` pass.
- **SC-002**: The orphan-PR pass is answerable with one `azdo pr list --work-items --json`.
