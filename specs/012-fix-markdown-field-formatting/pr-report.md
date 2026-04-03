# PR Report: Fix Markdown Field Formatting in Get Item Output

**Branch**: `012-fix-markdown-field-formatting`
**Date**: 2026-04-03
**Spec**: [specs/012-fix-markdown-field-formatting/spec.md](spec.md)

## Summary

When using the `get-item` command with `--markdown` enabled, field labels and their markdown content were concatenated without any separator, making the output unreadable. This fix ensures that single-line markdown values appear as `Label: value` on the same line, and multi-line markdown values start on the line after their label. Non-markdown output is unaffected.

## What's New

<!-- Filled in Phase 7 -->

- **[Area / Component]**: [What was added or changed and why]

## Testing

<!-- Filled in Phase 7 -->

- **[Unit / Integration / E2E / Manual]**: [What scenario or component was covered]
