# Research: Comments Markdown Support

**Branch**: `013-comments-markdown` | **Date**: 2026-04-03

## Decision Log

### Azure DevOps Comments API — Markdown Format

- **Decision**: Set `format: "markdown"` in the POST body when `--markdown` is passed to `comments add`.
- **Rationale**: The AzDO Work Item Comments REST API (`7.1-preview.4`) accepts a `format` field on the comment object. Valid values are `"html"` (default) and `"markdown"`. When `"markdown"` is sent, Azure DevOps stores and renders the text as markdown. Without the field, the API defaults to HTML rendering.
- **Alternatives considered**: Wrapping text in HTML `<p>` tags (rejected — loses markdown semantics), using a separate API version (unnecessary — same endpoint supports format field).

### HTML Detection for `--markdown` on List

- **Decision**: Reuse `isHtml()` from `src/services/html-detect.ts`.
- **Rationale**: Already used by `get-md-field` and `get-item --markdown`; well-tested; avoids duplication.
- **Alternatives considered**: Inline regex check (rejected — duplication and inconsistency).

### HTML-to-Markdown Conversion for `--markdown` on List

- **Decision**: Reuse `toMarkdown()` from `src/services/md-convert.ts`.
- **Rationale**: `toMarkdown()` already chains `isHtml()` → `htmlToMarkdown()`; consistent with existing patterns.
- **Alternatives considered**: Direct call to `NodeHtmlMarkdown.translate()` (rejected — bypasses isHtml guard and duplicates logic).

### `--markdown` + `--json` Interaction

- **Decision**: `--json` takes priority; when both flags are present, raw API data is returned without any markdown conversion.
- **Rationale**: Consistent with how `--json` behaves across every other command in the CLI. JSON consumers expect raw data.
- **Alternatives considered**: Converting text in JSON output too (rejected — breaks machine-readable use cases).

## Autonomous Decisions

- [AUTO] No new dependencies required — all utilities already exist in `src/services/`.
- [AUTO] The `addWorkItemComment` function in `src/services/azdo-client.ts` will accept an optional `format` parameter (`'html' | 'markdown'`), defaulting to `'html'` to preserve backward compatibility.
- [AUTO] `CommentCommandOptions` interface in `src/commands/comments.ts` will gain a `markdown?: boolean` field.
