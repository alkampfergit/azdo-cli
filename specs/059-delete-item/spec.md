# Feature Specification: delete a work item

**Feature Branch**: `feature/059-delete-item`
**Status**: Approved (issue #158, owner: "go ahead")

## Requirements
- **FR-1**: `azdo delete-item <id>` calls `DELETE _apis/wit/workitems/{id}` (Recycle Bin).
- **FR-2**: `--permanent` adds `destroy=true`.
- **FR-3**: Confirmation `[y/N]` on a TTY; `--yes` skips it; non-interactive without `--yes` exits 1 and deletes nothing.
- **FR-4**: Output `Deleted work item N` / `Permanently deleted work item N`; `--json` prints `{ id, permanent, deleted }`.
- **FR-5**: Errors go through `handleCommandError` (401/403, 404, 400).
- **FR-6**: Documented in `docs/commands.md` and `docs/changelogs/unreleased.md`.

## Out of scope
Several IDs per call, restoring from the Recycle Bin.
