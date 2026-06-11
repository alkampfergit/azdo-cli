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

- **`get-item` / `get-md-field` image download**: new opt-in flags `--download-images`,
  `--resize-images <pixels>`, and `--images-path <dir>` on both commands. Without a flag, no
  files are written; existing text/markdown output is unchanged.
- **Shared `image-download` service** (`src/services/image-download.ts`): extracts Azure
  DevOps attachment images from rich-text content — scanning HTML `<img src>` **and** Markdown
  `![alt](url)` (covering legacy HTML and native Markdown fields), de-duplicated by attachment
  GUID — and downloads each via the existing `downloadAttachment` transport.
- **Resize-to-PNG**: `--resize-images <N>` caps image width (aspect preserved, never upscaled)
  and re-encodes as PNG; supplying it implies `--download-images`. Invalid values are rejected
  before any download.
- **Robust behaviour**: images saved to the system temp dir by default (or `--images-path`),
  named `wi-<id>-<index><ext>` (collision-free); per-image failures are reported to stderr
  without aborting the rest; "no images found" is reported cleanly.
- **Docs**: README and `docs/commands.md` document the new flags with examples.

## New Libraries / Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| jimp | ^1.6.1 | Pure-JS image decode/resize/PNG-encode for `--resize-images`; chosen over native `sharp` to keep the tsup bundle and npm distribution intact (Constitution IV). |

## Testing

- **Unit (`tests/unit/image-download.test.ts`)**: HTML + Markdown extraction, ADO-attachment-only
  filtering, GUID de-dup across both forms, HTML-entity decoding, filename derivation, option
  resolution/validation, resize decision (downscale / no-upscale / aspect), PNG re-encode, and
  partial-failure handling (real PNGs via jimp written to a temp dir).
- **Unit (`tests/unit/get-item-images.test.ts`, `tests/unit/get-md-field-images.test.ts`)**:
  opt-in guarantee (no download without flags), download triggered with flags, `--resize-images`
  implies download, invalid `--resize-images` rejected with nothing downloaded, "no images found".
- **Gates**: `npm test` (730 passed, 7 integration skipped without creds), `npm run lint`,
  `npm run typecheck`, `npm run build` all green.

## Notes

- Deferred to follow-up issue **#46**: authoritative HTML-vs-Markdown field-format detection via
  `multilineFieldsFormat`, and the existing `isHtml()` mixed-content misclassification.
- Markdown plain links `[text](url)` (non-image attachments) are out of scope.
- Quickstart step T023 (live validation against work item 41748) requires real Azure DevOps
  access and is a manual check for the owner — it cannot run in CI/sandbox.
