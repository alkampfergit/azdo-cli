# PR Report: Comments Markdown Support

**Branch**: `013-comments-markdown`
**Date**: 2026-04-03
**Spec**: [specs/013-comments-markdown/spec.md](spec.md)

## Summary

Adds `--markdown` support to the `azdo comments add` and `azdo comments list` commands. When posting a comment with `--markdown`, the Azure DevOps API is instructed to store and render the text as markdown. When listing comments with `--markdown`, HTML comment bodies are automatically converted to readable markdown before display, giving users a consistent output regardless of how each comment was originally authored.

## What's New

- **`comments add --markdown`**: New flag that sets `format: "markdown"` in the Azure DevOps Comments API request body, causing Azure DevOps to store and render the comment as markdown instead of HTML.
- **`comments list --markdown`**: New flag that passes each comment body through the existing `toMarkdown()` utility before display. HTML comments are converted; plain-text and markdown comments are passed through unchanged. JSON output (`--json`) is never affected.
- **`src/services/azdo-client.ts` — `addWorkItemComment`**: Extended with an optional `format` parameter (`'html' | 'markdown'`, defaulting to `'html'`) included in the POST body. Backward-compatible: callers that omit the parameter retain existing behaviour.

## Testing

- **Unit — `comments add`**: New tests verify that `addWorkItemComment` is called with `format: 'markdown'` when `--markdown` is passed and `format: 'html'` when it is absent.
- **Unit — `comments list`**: New tests verify HTML bodies are converted to markdown, non-HTML bodies pass through unchanged, and `--json` output always returns raw API text regardless of `--markdown`.
- **Unit — `azdo-client`**: Existing `addWorkItemComment` test updated to expect `format: 'html'` in the POST body (no functional change, just reflects the new explicit default).

## Notes

- Azure DevOps API behaviour when `format: "markdown"` is sent depends on the organisation's AzDO version. The flag is forwarded as-is; if AzDO ignores it, the comment text is still stored correctly.
