# PR Report: Work Item Attachment Create/Delete

**Branch**: `036-workitem-attachment-crud`
**Date**: 2026-08-27
**Spec**: [specs/036-workitem-attachment-crud/spec.md](./spec.md)

## Summary

Adds `azdo add-attachment` and `azdo delete-attachment` so users can upload a local file to a work item and remove a named attachment, without leaving the CLI. Both commands follow the existing `download-attachment` command's flat, non-subcommand surface and reuse the repo's existing HTTP/error-handling plumbing — no new dependencies.

## What's New

- **`azdo add-attachment <id> <file>`**: uploads a local file (`POST .../_apis/wit/attachments`) and links it to the work item as a new `AttachedFile` relation, with an optional `--comment`. Validates the local file exists and is a regular file before any network call. Never replaces an existing attachment that shares its filename — always adds a new, separate attachment. Reports the attached file's name, size, and a stable per-attachment ID.
- **`azdo delete-attachment <id> <filename>`**: removes a specific `AttachedFile` relation by array index (there is no dedicated attachment-delete endpoint — removal is unlinking the relation). Confirms interactively by default; `--yes`/`-y` skips the prompt for scripting. When more than one attachment shares the given filename, lists the candidates (ID, size, upload date) and refuses to guess — even under `--yes` — until `--id <guid>` disambiguates. Declines (rather than assuming an answer) when it can't prompt interactively and `--yes` wasn't given.
- **`WorkItemAttachment` type**: gained an `id: string` field (the attachment GUID, parsed from its URL). Populated the same way for every existing caller (`get-item`, `download-attachment`), so those commands display the ID for free with no behavior change to their existing fields.
- **`azdo-client.ts`**: new `createAttachment()` (upload) and `findAttachmentRelations()` (resolves current relation array indices + metadata by filename, for the delete command's disambiguation and index-based removal) service functions; `extractAttachmentGuid()` extracted and exported from `image-download.ts` so both image embedding and attachment listing share one GUID-parsing implementation; `JsonPatchOperation.value` widened to accept relation objects (not just scalar field strings), reusing the existing `applyWorkItemPatch()` for both the attach-link and delete-unlink patches.
- **`command-helpers.ts`**: `promptYesNo()` lifted out of `auth.ts` so `delete-attachment` can reuse the same `[y/N]` prompt implementation as the existing PAT/credential overwrite confirmations.

## Testing

- **Unit**: `tests/unit/add-attachment.test.ts` (6 tests) and `tests/unit/delete-attachment.test.ts` (7 tests) cover every acceptance scenario in spec.md via mocked service calls — success paths, missing/non-file local paths (no network call made), work-item errors via `handleCommandError`, `--comment` pass-through, the ambiguous-filename refusal (including under `--yes`), `--id` disambiguation, and the non-interactive-without-`--yes` decline. `tests/unit/cli.test.ts` gained coverage asserting both commands appear in top-level `--help` and that each command's own `--help` documents its arguments/options. Existing attachment-related fixtures (`get-item-attachments.test.ts`, `download-attachment.test.ts`) updated for the new `id` field.
- **Integration**: `tests/integration/work-item-attachments.test.ts` (`SKIP_AZDO`-gated, 2 tests) creates a scratch work item and exercises the real Azure DevOps API — attach → verify via `getWorkItem` → delete → verify gone, and the two-attachments-sharing-a-filename → disambiguate-by-ID → verify-only-one-removed path.
- **Manual**: walked `quickstart.md` end-to-end against the built CLI and a real work item (#46111, closed afterward) — attach with/without `--comment`, verify via `get-item`/`download-attachment`, delete with `--yes`, the ambiguous-filename refusal (confirmed it still refuses even with `--yes`), disambiguation via `--id`, and the non-interactive confirmation-required decline. Every stdout/stderr line matched the documented format exactly.
