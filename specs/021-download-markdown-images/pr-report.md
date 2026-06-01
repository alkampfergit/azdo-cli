# PR Report: Download images from markdown field

**Branch**: `021-download-markdown-images`
**Date**: 2026-06-01
**Spec**: [specs/021-download-markdown-images/spec.md](./spec.md)

## Summary

Adds an opt-in way to download images embedded in a work item's rich-text fields directly
from the CLI. Both `get-item` and `get-md-field` gain `--download-images`, `--resize-images <N>`,
and `--images-path <dir>` flags, so a user can pull a work item's embedded screenshots to
disk (optionally resized for LLM consumption) instead of copying attachment links by hand.

## What's New

<!-- Finalised in step 11 after implementation. -->

- _(pending implementation)_

## New Libraries / Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| jimp | _(pending)_ | Pure-JS image decode/resize/PNG-encode for `--resize-images`; chosen over native `sharp` to keep the tsup single-file bundle and npm distribution intact. |

## Testing

<!-- Finalised in step 11. -->

- _(pending implementation)_

## Notes

- Deferred to a follow-up issue: authoritative HTML-vs-Markdown field-format detection via
  `multilineFieldsFormat`, and the existing `isHtml()` mixed-content misclassification.
- Markdown plain links `[text](url)` (non-image attachments) are out of scope.
