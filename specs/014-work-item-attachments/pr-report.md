# PR Report: Work Item Attachments

**Branch**: `014-work-item-attachments`
**Date**: 2026-04-08
**Spec**: [specs/014-work-item-attachments/spec.md](spec.md)

## Summary

This feature adds attachment support to the CLI. The `get-item` command now displays a list of attachments (filename and size) when a work item has them, and a new `download-attachment` command allows users to download any attachment to their local filesystem.

## What's New

- **get-item command**: Now fetches work item relations via `$expand=relations` and displays an "Attachments" section listing each file's name and human-readable size. In `--short` mode, shows only the attachment count.
- **download-attachment command**: New command that downloads a specific attachment by filename from a work item. Supports `--output` for specifying the target directory, and reuses existing `--org`/`--project` options.
- **Azure DevOps client**: Added `downloadAttachment()` function for fetching attachment binary content and updated `getWorkItem()` to parse `AttachedFile` relations into a typed `WorkItemAttachment[]`.
- **Types**: Added `WorkItemAttachment` interface and extended `WorkItem` with an optional `attachments` field.

## Testing

- **Unit**: Tests for `formatFileSize` helper covering bytes, KB, and MB formatting.
- **Unit**: Tests for `formatWorkItem` with attachments in full mode (listing), short mode (count), and null (omitted).
- **Unit**: Tests for `getWorkItem` extracting attachments from API relations, handling non-attachment relations, and undefined relations.
- **Unit**: Tests for `downloadAttachment` fetching binary content and handling 404 errors.
- **Unit**: Test verifying `$expand=relations` is included in the API URL.

## Notes

- No new runtime dependencies were added. File I/O uses `node:fs/promises` and `node:path` (built-in).
- Attachments are identified by filename. If a work item has multiple attachments with the same name, the first match is downloaded.
