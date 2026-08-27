# PR Report: Work Item Attachment Create/Delete

**Branch**: `036-workitem-attachment-crud`
**Date**: 2026-08-27
**Spec**: [specs/036-workitem-attachment-crud/spec.md](./spec.md)

## Summary

Adds `azdo add-attachment` and `azdo delete-attachment` so users can upload a local file to a work item and remove a named attachment, without leaving the CLI. Both commands follow the existing `download-attachment` command's flat, non-subcommand surface and reuse the repo's existing HTTP/error-handling plumbing — no new dependencies.

## What's New

<!-- filled in step 11, once /speckit-implement completes -->

## Testing

<!-- filled in step 11, once /speckit-implement completes -->
