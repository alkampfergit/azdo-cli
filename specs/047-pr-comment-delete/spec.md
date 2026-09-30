# Feature Specification: `azdo pr comments delete`

**Feature Branch**: `feature/047-pr-comment-delete`
**Created**: 2026-09-30
**Status**: Implemented
**Input**: GitHub issue #120 (context: alkampfergit/automata-cli#94, item F5).

## Context

`azdo pr comments` can list threads, open a new one (`add`), rewrite a comment
in place (`edit`) and append to a thread (`reply`). It cannot remove a comment.
Automata posts a marker comment on a pull request and later needs to remove or
replace it; the GitHub equivalent it already uses is
`gh api -X DELETE repos/…/issues/comments/<id>`. Without a delete verb the only
option is to `edit` the marker down to a placeholder body, which leaves noise in
the thread and is not what "remove" means.

Azure DevOps exposes exactly this operation (Pull Request Thread Comments -
Delete, api-version 7.1):

```
DELETE https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{prId}/threads/{threadId}/comments/{commentId}?api-version=7.1
```

It answers `200` (or `204`) with no useful body, requires `vso.code_write` or
`vso.threads_full`, and only the comment's author may delete it. Deleted
comments come back from the thread listing with `isDeleted: true`, which the
CLI's list mapper already drops.

## User Scenarios

### US-1 — Remove a marker comment (P1)

A bot posted a marker as a new thread with `pr comments add` and stored the
returned thread id. It now runs
`azdo pr comments delete <threadId> --pr-number N --json`. The single comment in
that thread is deleted, the command prints `{ …, "deleted": true }`, and
`azdo pr comments --pr-number N --json` no longer lists it.

### US-2 — Delete one reply out of several (P1)

A thread holds the original comment plus replies. Running `delete <threadId>`
without `--comment-id` must **not** guess: it fails with a message listing the
candidate comment ids and their authors. Running it again with
`--comment-id <id>` deletes exactly that comment.

### US-3 — Scripted, unattended use (P1)

The command never prompts, under a TTY or not: the caller that motivated it is
a bot. A human who wants to see what would go uses `--dry-run`.

### US-4 — Wrong target (P2)

An unknown thread id, or a `--comment-id` that is not in the thread, fails with
a readable message and exit 3 **before** any DELETE is issued.

### US-5 — Somebody else's comment (P2)

Azure DevOps refuses the deletion with 403. The command reports "Access denied"
with the server's own explanation and exit 4.

## Requirements

### Functional

- **FR-001** A new command `azdo pr comments delete <threadId>` MUST delete one
  comment via the documented DELETE route above. It MUST carry the top-level
  alias `azdo pr comment-delete`, matching `comment-add` / `comment-edit` /
  `comment-reply`.
- **FR-002** `--comment-id <N>` selects the comment. When it is omitted the
  command MUST delete the thread's only visible comment, and MUST fail (exit 1,
  no write) when the thread holds several, naming every candidate as
  `#id (author)` so the caller can pick.
- **FR-003** The thread MUST be fetched before the DELETE so that an unknown
  thread, an unknown comment, or a thread with nothing left to delete fail with
  exit 3 and a message naming the ids, and no write is attempted.
- **FR-004** The command MUST NOT prompt for confirmation, under a TTY or
  otherwise.
- **FR-005** `--dry-run` MUST resolve the comment, print what would be deleted
  (comment id, author, body length, thread, PR), and exit 0 without writing.
- **FR-006** `--json` MUST return a flat object
  `{ pullRequestId, threadId, commentId, deleted, dryRun }`, with `deleted`
  `true` on a real deletion and `false` on a dry run.
- **FR-007** The command MUST accept `--org`, `--project`, `--repo`,
  `--pr-number` and `--json` with the same plumbing as `edit` (values read
  through the merged option view so the nested form does not lose them), and
  MUST honour the `pr` group's exit-code contract: 1 validation / other, 3 not
  found, 4 not permitted.
- **FR-008** A rejection the CLI does not predict (for example a server-side
  rule about the PR's state) MUST surface with the server's own message, via
  the 037 error surfacing. The command MUST NOT refuse a completed pull request
  client-side: Azure DevOps allows comment writes on completed PRs, so the
  server is the authority.
- **FR-009** Invalid `<threadId>` or `--comment-id` values MUST be rejected
  before any network call (exit 1).

### Non-functional

- **NFR-001** No new runtime dependencies.
- **NFR-002** The client function MUST NOT parse a response body; the endpoint
  returns none of value and a `204` would make `response.json()` throw.

## Acceptance

- The comment is gone from the thread; `pr comments --json` no longer lists it.
- `docs/commands.md` (cheat sheet, command block, scope note, exit-code table)
  and `--help` describe the command. `README.md` quick start gains one line.

## Out of Scope

- Deleting a whole thread (Azure DevOps has no thread DELETE; a thread empties
  when its last comment is deleted and the CLI already hides empty threads).
- Any confirmation flag (`--yes` / `--force`): there is no prompt to bypass.
- Bulk deletion or deletion by content match; callers compose with
  `pr comments --contains … --json`.
