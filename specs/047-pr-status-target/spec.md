# Feature Specification: `pr status` for an arbitrary PR or branch

**Feature Branch**: `feature/047-pr-status-target`
**Created**: 2026-10-01
**Status**: Approved (issue #123, owner: "proceed")
**Input**: Issue #123 — automata (alkampfergit/automata-cli#94, item F8) needs
PR checks for another PR or branch without checking it out; replaces
`gh pr view <branch> --json statusCheckRollup`.

## Context

`azdo pr status` resolves the current git branch and lists its PRs with checks
(status API + policy evaluations + builds) and code-comment counts. There is no
way to point it elsewhere. `pr status` was kept a multi-PR overview without the
single-PR `--pr-number` contract (owner decision A on PR #43); this feature adds
targeting options without changing that contract.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Checks for a specific PR (Priority: P1)

**Acceptance Scenarios**:

1. **Given** PR 96 exists, **When** `azdo pr status --pr-number 96 [--json]`
   runs from any branch, **Then** the output is the usual status block / JSON
   for exactly that PR (any status), `branch` = its source branch, and the
   local git branch is not read.
2. **Given** no PR 999, **When** `--pr-number 999` runs, **Then** stderr says
   `Pull request #999 not found in <org>/<project>/<repo>.`, exit 3, stdout empty.
3. **Given** `--pr-number 0|-1|abc`, **Then** exit 1 before any network call.

### User Story 2 - Checks for another branch (Priority: P1)

1. **Given** branch `feature/x` has PRs, **When** `azdo pr status --branch
   feature/x [--json]` runs, **Then** its PRs are listed exactly as the default
   view would for that branch; `refs/heads/` prefix accepted; git branch not read.
2. **Given** a branch with no PRs (or that does not exist), **Then** stderr says
   `No pull requests found for branch <b> in <org>/<project>/<repo>.`, exit 1,
   stdout empty.
3. **Given** `--branch ''`, **Then** exit 1 before any network call.

### Edge Cases

- `--pr-number` and `--branch` together → `Cannot specify both --pr-number and
  --branch.`, exit 1, no network call.
- Neither option → behaviour unchanged, including exit 0 on an empty result.

## Requirements

- **FR-001** `pr status` accepts `--pr-number <id>` and `--branch <name>`.
- **FR-002** Same text and `--json` shape (`PullRequestStatusResult`) for every target.
- **FR-003** The options are mutually exclusive.
- **FR-004** An explicit target matching nothing exits non-zero with a clear message.
- **FR-005** `pr status` still does not carry the C-1 help sentence / C-2/C-3 errors.
- **FR-006** Documented in `docs/commands.md`; no README change.

## Success Criteria

- automata can replace `gh pr view <branch> --json statusCheckRollup` with
  `azdo pr status --branch <branch> --json`.
