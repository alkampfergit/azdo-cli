# PR Report: `azdo pr comments delete`

**Branch**: `feature/047-pr-comment-delete`
**Date**: 2026-09-30
**Spec**: [specs/047-pr-comment-delete/spec.md](./spec.md)

## Summary

`azdo pr comments` could add, edit and reply to comments but never remove one,
so a bot that posts a marker comment had no way to take it back other than
blanking it. This adds `azdo pr comments delete <threadId>` (alias
`azdo pr comment-delete`) over the documented
`DELETE .../threads/{threadId}/comments/{commentId}` (Closes #120).

## What's New

- **`src/services/pr-client.ts` — `deleteThreadComment()`**: sends the DELETE
  with only the auth headers, throws `httpError` on a non-ok status and reads no
  body (the endpoint answers 200/204 with nothing useful). 401/403/404 sentinels
  come from `fetchWithErrors` as for every other call.
- **`src/commands/pr.ts` — `azdo pr comments delete` / `azdo pr comment-delete`**:
  `--comment-id <N>` picks the comment and may be omitted only when the thread
  holds a single visible comment; an ambiguous thread is refused (exit 1) with
  the candidates listed as `#id (author)`. `--dry-run` previews; `--json`
  returns `{ pullRequestId, threadId, commentId, deleted, dryRun }`.
- **Shared helpers**: `--comment-id` parsing (`parseExplicitCommentId`) and the
  comment lookup (`findCommentInThread`) are now shared with `edit`;
  `fetchThreadForEdit` was renamed `fetchTargetThread`. No behaviour change for
  `edit`.

## Design Notes

- **No "first comment" default.** `edit` defaults to the thread's first comment
  because rewriting is recoverable. A deletion is not, so `delete` only acts
  without `--comment-id` when there is exactly one comment to act on.
- **No confirmation prompt, TTY or not.** The caller that motivated the command
  is a script; `--dry-run` is the human preview. Same reasoning as 039's
  `abandon`.
- **The thread is fetched first**, so an unknown thread or comment is reported
  as exit 3 before any write, and the ambiguity check sees the same comment list
  the caller sees in `pr comments`.
- **A completed PR is not refused client-side.** The issue lists it as a failure
  case, but Azure DevOps allows comment writes on completed pull requests. The
  server stays the authority; should it reject, its own message surfaces under
  `HTTP_<status>` (037) with exit 1. A 403 for somebody else's comment is exit 4.
- **Listings already hide deleted comments** (`mapComment` skips `isDeleted`),
  so the acceptance criterion "`pr comments --json` no longer lists it" needed
  no change.

## Testing

- **Unit** `tests/unit/pr-comment-authoring.test.ts` (16 new): single-comment
  default, ambiguous refusal with candidates, explicit id, invalid ids before
  any network call, not-found exit 3 for thread / comment / empty thread,
  `--dry-run` text + JSON, `--json` shape, branch auto-detection, 403 → exit 4
  with the server detail, server rejection surfaced, no prompt, alias parity.
- **Unit** `tests/unit/pr-client.test.ts` (4 new): DELETE URL/method, no request
  body, no response body read on 204, 403 / 404 / 400 mapping.
- **Unit** `tests/unit/pr-command-tree.test.ts` (3 new): nested and alias forms
  through the real `azdo pr` tree with `--pr-number`, `--comment-id`, `--repo`,
  `--json`.
- `tests/unit/docs-command-reference.test.ts` (existing) pins that the new
  command, alias and options appear in `docs/commands.md`.

## Docs

`docs/commands.md`: cheat-sheet line, a full `pr comments delete` block, the
write-scope note and the exit-code table. `README.md`: one quick-start line.
`docs/changelogs/unreleased.md`: Added entry. `AGENTS.md`: Recent
Changes.

## Notes

- No new dependencies.
- Out of scope: deleting a whole thread (no such Azure DevOps route), bulk
  deletion, a `--yes` flag (there is no prompt to bypass).
