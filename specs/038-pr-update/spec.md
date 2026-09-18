# Feature Specification: `azdo pr update` and `--description-file` on `pr open`

**Feature Branch**: `feature/038-pr-update`
**Created**: 2026-09-16
**Status**: Draft
**Input**: GitHub issue #96 (child of #92, point 2 plus the "minor" `--description-file` point).

## Context

A pull request's title and description are the only write-once fields in the
CLI. `src/commands/pr.ts` registers `list`, `status`, `open`, `comments`,
`comment-resolve`, `comment-reopen`, `comment-reply`, `comment-add`,
`comment-edit`, `work-items` and `reviewers` — there is no `update`. Re-running
`pr open` on a branch that already has an active PR returns
`{"created": false}` and changes nothing, by design.

The gap turned a recoverable mistake into a dead end: a diagnostic call with a
placeholder title created a real pull request titled `test probe`, and the CLI
offered no route to correct it. The PR kept its placeholder text, visible to
reviewers, until a human fixed it in the web UI.

The asymmetry is the argument. Work items are fully mutable (`set-field`,
`set-md-field`, `set-state`, `assign`, and `upsert` is explicitly
create-*or-update*); even PR **comments** can be rewritten in place via
`pr comment-edit`. Only the pull request's own title and description cannot.

Separately, `pr open --description` accepts inline text only. Every other
body-carrying command in the `pr` group (`comments add`, `comments edit`,
`comments reply`) takes `--file <path>`, because a real PR description is a
markdown document, not a shell argument — and on PowerShell a multi-line
inline string is close to unusable.

## User Scenarios

### US-1 — Correct a wrong title (P1)

An operator opened a PR with a placeholder title. They run
`azdo pr update --pr-number 96 --title "pr: add azdo pr update"` and the title
is corrected. The description is untouched.

### US-2 — Replace a description from a file (P1)

An operator has rewritten the PR description in `pr-body.md`. They run
`azdo pr update --pr-number 96 --description-file pr-body.md`. The stored
description becomes exactly the file's content. The title is untouched.

### US-3 — Open a PR with a file-sourced description (P2)

An operator composes the description in a file (or pipes it from another tool)
and runs `azdo pr open --title "…" --description-file body.md`, or
`… --description-file -`. The description is composed with the repository
template exactly as if the text had been passed inline.

### US-4 — Re-run with identical values (P2)

Automation re-runs the same `pr update` after a retry. Nothing changed, so the
command reports a no-op, issues no write, and exits 0 — matching the `noop`
convention already used by `pr work-items link` and `pr reviewers add`.

## Requirements

### Functional

- **FR-001** A new command `azdo pr update` MUST update the title and/or the
  description of a pull request via `PATCH .../pullrequests/{id}`.
- **FR-002** The command MUST accept `--pr-number <N>`; when omitted it MUST
  resolve the single active pull request of the current branch, failing with
  the existing zero-match / multi-match contract messages (C-2 / C-3) when the
  branch does not resolve to exactly one PR.
- **FR-003** `--title <s>` and `--description <s>` MUST be individually
  optional: only the fields supplied are sent. Supplying neither MUST fail
  (exit 1) with a message naming the four flags.
- **FR-004** `--title-file <path>` and `--description-file <path>` MUST read the
  value from a UTF-8 file. `--title` / `--title-file` are mutually exclusive, as
  are `--description` / `--description-file`; supplying both of a pair MUST
  fail (exit 1).
- **FR-005** A path of `-` MUST mean "read standard input". Because stdin can be
  consumed only once, `-` MUST NOT be used for both files in the same
  invocation (exit 1).
- **FR-006** `pr update --description` MUST replace the description
  **literally**. No repository pull request template is looked up, resolved or
  prepended — that would re-prepend the template on every edit. The help text
  MUST say so.
- **FR-007** Values MUST be trimmed; an empty (or whitespace-only) title or
  description MUST fail (exit 1) rather than silently clearing the field,
  matching `resolveCommentBody`'s existing empty-body rejection.
- **FR-008** When every supplied field already holds the requested value, the
  command MUST report a no-op, issue **no** PATCH, and exit 0. `--json` MUST
  carry `noop: true`.
- **FR-009** The composed description MUST be pre-flighted against the
  documented 4000-character Azure DevOps cap and rejected (exit 1) before the
  PATCH when it is over, naming the actual and the allowed length.
- **FR-010** `pr open` MUST accept `--description-file <path>` (including `-`),
  mutually exclusive with `--description`. The resulting text is composed with
  the repository template exactly as inline text is — `pr open` semantics do
  not change.
- **FR-011** `pr update` MUST accept the group-wide `--org`, `--project`,
  `--repo` and `--json` options, and MUST honour the `pr` group's exit-code
  contract (1 validation, 3 not found, 4 not permitted).
- **FR-012** `--json` output MUST be a flat object:
  `{ pullRequestId, title, description, url, noop, updatedFields }`, where
  `updatedFields` is the list of fields actually written (`[]` on a no-op).

### Non-functional

- **NFR-001** No new runtime dependencies.
- **NFR-002** The file/stdin resolution MUST reuse the existing
  `resolveCommentBody` machinery rather than adding a second reader; adding `-`
  support there makes stdin work uniformly for `comments add|edit|reply` too.

## Out of Scope

- `pr abandon` / `--reactivate` (issue #97). Status changes ride the same
  `PATCH` but are a separate command surface and a separate spec.
- `isDraft`, `targetRefName` retargeting, auto-complete, merge options, labels.
- `--title-file` on `pr open` (issue #96 scopes it to `pr update`).
- Clearing a description (setting it to empty) — FR-007 rejects it.

## Acceptance

- `azdo pr update --pr-number N --title X` changes only the title; the
  description is not sent and not modified.
- `--description-file` works on both `pr open` and `pr update`, including `-`
  for stdin.
- Re-running with identical values reports a no-op (`noop: true` in `--json`)
  and issues no PATCH.
- `docs/commands.md` documents the command, its flags, the literal-replacement
  rule and the JSON shape.

## Open decisions — resolved

| Decision | Resolution |
| --- | --- |
| Template semantics on update | **Literal replacement, no template.** Prepending the repository template on update would re-prepend it on every edit. Stated in `--description`'s help text. (FR-006) |
| Are `--title` / `--description` individually optional? | **Yes**, patch only what is given; error when neither is supplied. (FR-003) |
| Does an empty file clear the field? | **No** — rejected as an empty value. Clearing is out of scope. (FR-007) |
