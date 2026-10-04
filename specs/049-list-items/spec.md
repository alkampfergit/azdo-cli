# Feature Specification: `azdo list-items`

**Feature Branch**: `feature/049-list-items`
**Created**: 2026-10-04
**Status**: Approved (issue #128, owner: "Proceed")
**Input**: Issue #128 — automata (alkampfergit/automata-cli#94, F1) must discover work items to implement; the GitHub equivalent is `gh issue list --label/--assignee/--search`.

## Decision

A new top-level command `azdo list-items` (not a free-form `query --wiql`; the filters are what the consumer needs and keep WIQL injection out of scope). One WIQL `POST .../_apis/wit/wiql?$top=n` for ids, then `POST .../_apis/wit/workitemsbatch` (≤200 ids per call) for fields.

## Requirements

- FR-1 Filters `--state`, `--tag`, `--assigned-to` (`@me` → WIQL macro), `--title-contains`, `--top` (default 50, 1..1000), combined with AND, scoped with `[System.TeamProject] = @project`, ordered `ChangedDate DESC`.
- FR-2 Every value is a WIQL string literal with `'` doubled.
- FR-3 `--json` → `[{ id, title, description (markdown), url, state, tags[], assignedTo|null }]`; `[]` when empty.
- FR-4 Text: `id<TAB>state<TAB>assignee<TAB>title [tags]`.
- FR-5 `--org/--project` overrides as elsewhere; invalid `--top` exits 1 before any request.
- FR-6 Description combines Description / Acceptance Criteria / Repro Steps like `get-item`; those two process fields are dropped on retry when the org rejects them (TF51535).

## Acceptance

- One call returns filtered items with the fields above; docs (`docs/commands.md`) and `--help` updated. No new dependencies.
