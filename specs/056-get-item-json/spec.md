# Feature Specification: `get-item --json`

**Feature Branch**: `feature/056-get-item-json`
**Created**: 2026-10-08
**Status**: Approved (issue #129, owner: "Proceed")
**Input**: Issue #129 — one JSON read of a work item, including linked pull requests (automata-cli#94, item F2).

## Requirements
- **FR-1**: `azdo get-item <id> --json` prints one object `{ id, title, description, state, tags, assignedTo, createdBy, createdDate, url, relations }` and nothing else on stdout.
- **FR-2**: `description` is markdown (`""` when empty); `tags` is an array.
- **FR-3**: `assignedTo` / `createdBy` are `{ displayName, uniqueName, id }` or `null` (stable identity, same source as 055).
- **FR-4**: `relations` lists all relations. Pull request ArtifactLinks carry `pullRequest: { id, repositoryId, projectId }` parsed from the `vstfs:///Git/PullRequestId/…` URI; work item links carry `workItemId`.
- **FR-5**: `--json` with image download options is an error (exit 1) before any network call.
- **FR-6**: `docs/commands.md` and `--help` document it.

## Notes
The artifact URI carries repository **id**, not name; resolving names would cost an extra call per repo and is left out. New fields on `WorkItem` are optional so other producers stay valid.

## Out of scope
Comments in the JSON (`comments list --json` exists); changing `relations list`; repository name resolution.
