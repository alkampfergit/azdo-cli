# Feature Specification: `azdo comments edit` / `delete`

**Feature Branch**: `feature/053-comments-edit-delete`
**Created**: 2026-10-05
**Status**: Approved (issue #131, owner: "implement")
**Input**: Issue #131 — automata (alkampfergit/automata-cli#94, item F4) posts a marker comment on a work item and must later update or remove it. Only `comments list` and `add` exist.

## User Scenarios & Testing

### Story 1 - Edit a comment (P1)
`azdo comments edit <id> <commentId> [text] [--file <path|->] [--markdown] [--org --project] [--json]` → `PATCH .../wit/workItems/{id}/comments/{commentId}?format=…` with `{ "text": … }`.
**Independent test**: `tests/unit/comments-edit-delete.test.ts`, `comments-edit-delete-client.test.ts`.

### Story 2 - Delete a comment (P1)
`azdo comments delete <id> <commentId> [--org --project] [--json]` → `DELETE` on the same URL. Azure DevOps soft-deletes; `comments list` already filters `isDeleted`.

## Requirements
- **FR-1/2**: commands registered in `createCommentsCommand()`.
- **FR-3**: blank text (inline or file) → exit 1, no request. Inline text and `--file` together → exit 1. `--file -` reads stdin.
- **FR-4**: `--json` edit → `{ workItemId, commentId, text, author, createdAt, modifiedAt, url }`; delete → `{ workItemId, commentId, deleted: true }`.
- **FR-5**: `Updated comment #N on work item #M` / `Deleted comment #N from work item #M`.
- **FR-6**: 404 → `Comment N not found on work item M in org/project.` (exit 1); 401/403/400 reuse the 037 surfacing. Nothing on stdout on failure.
- **FR-7**: no delete confirmation prompt; deleting an unknown or already-deleted comment is an error (owner confirmed).
- **FR-8**: `docs/commands.md` and `--help` updated; README untouched.
- `comments add --json` already returns `commentId` / `createdAt` (documented, no code change).

## Out of scope
Reactions, bulk delete, hard delete.
