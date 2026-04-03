# PR Report: Fix Markdown Field Formatting in Get Item Output

**Branch**: `012-fix-markdown-field-formatting`
**Date**: 2026-04-03
**Spec**: [specs/012-fix-markdown-field-formatting/spec.md](spec.md)

## Summary

When using the `get-item` command with `--markdown` enabled, field labels and their markdown content were concatenated without any separator, making the output unreadable. This fix ensures that single-line markdown values appear as `Label: value` on the same line, and multi-line markdown values start on the line after their label. Non-markdown output is unaffected.

## What's New

- **`formatMarkdownField` helper** (`src/commands/get-item.ts`): New exported pure function that formats a field label and its markdown value. If the value is single-line, it returns `Label: value`; if multi-line, it returns `Label:\n<content>`. This encodes the formatting rule in one place.
- **`formatExtraFields`** (`src/commands/get-item.ts`): Updated to use `formatMarkdownField` when markdown mode is enabled, replacing the old `padEnd(13)` concatenation that produced unreadable output. Non-markdown mode retains the original padded format unchanged.
- **`summarizeDescription`** (`src/commands/get-item.ts`): Updated to accept a `markdown` flag and apply `formatMarkdownField` when formatting the description label+content in short mode, so multi-line descriptions start on the line after the label.
- **Unit tests** (`tests/unit/get-item-markdown.test.ts`): 7 new tests covering single-line separator, multi-line label-then-content, non-markdown mode backward compatibility, empty values, and HTML-to-markdown single-line conversion.

## Testing

- **Unit**: New tests in `tests/unit/get-item-markdown.test.ts` verify `formatWorkItem` produces `Label: value` for single-line markdown fields, `Label:\n<content>` for multi-line markdown fields, and the old padded format for non-markdown mode. All 348 tests pass.
- **Unit**: Updated existing test for plain-text extra field in markdown mode to expect new `Tags: v1.0, release` format (was `Tags         v1.0, release`).

## Notes

- The `formatMarkdownField` function is exported to facilitate direct unit testing.
- Non-markdown (stripHtml) output format is entirely unchanged — no regressions in the existing 341 tests.
