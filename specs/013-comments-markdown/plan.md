# Implementation Plan: Comments Markdown Support

**Branch**: `013-comments-markdown` | **Date**: 2026-04-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/013-comments-markdown/spec.md`

## Summary

Add `--markdown` flag to both `azdo comments add` and `azdo comments list`. For `add`, the flag sends the comment to the Azure DevOps API with `format: "markdown"` so Azure DevOps renders it as markdown. For `list`, the flag passes each comment body through the existing `toMarkdown()` utility before display, converting HTML comments to markdown while leaving non-HTML comments unchanged. No new dependencies are required.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js LTS (18+)
**Primary Dependencies**: commander.js (CLI), node-html-markdown (HTML→MD, existing)
**Storage**: N/A — reads/writes Azure DevOps REST API only
**Testing**: vitest
**Target Platform**: Linux/macOS/Windows CLI
**Project Type**: CLI tool
**Performance Goals**: N/A — single-user CLI; no throughput requirements
**Constraints**: No new runtime dependencies; must not break existing behaviour
**Scale/Scope**: Two existing commands gain one new flag each; two new sets of unit tests

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. CLI-First Design | PASS | Both flags are proper commander.js options with `--json` honoured |
| II. TypeScript Strictness | PASS | `markdown?: boolean` typed in options interface |
| III. Single Responsibility | PASS | Each command still does one thing; flag adds format control only |
| IV. npm Distribution | PASS | No new runtime deps; bundle unchanged |
| V. Simplicity | PASS | Reuses existing `toMarkdown()` and `isHtml()` utilities |

All gates pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/013-comments-markdown/
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   └── cli-commands.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (modified files only)

```text
src/
├── commands/
│   └── comments.ts          # Add --markdown option to add and list subcommands
└── services/
    └── azdo-client.ts       # Add optional format parameter to addWorkItemComment

tests/
└── unit/
    ├── comments-add.test.ts  # Add --markdown tests
    └── comments-list.test.ts # Add --markdown tests
```

**Structure Decision**: Single-project layout. Only two source files need modification; no new files are required in `src/`.

## Implementation Approach

### `comments add --markdown`

In `src/services/azdo-client.ts`, extend `addWorkItemComment` to accept an optional `format: 'html' | 'markdown'` parameter (default `'html'`). Include the `format` field in the POST request body when calling the API.

In `src/commands/comments.ts`, add `.option('--markdown', 'post comment as markdown')` to the `add` subcommand. Pass `format: options.markdown ? 'markdown' : 'html'` to `addWorkItemComment`.

### `comments list --markdown`

In `src/commands/comments.ts`, add `.option('--markdown', 'convert HTML comment bodies to markdown')` to the `list` subcommand. In the action handler, when `options.markdown` is true and `options.json` is false, pass each comment's `text` through `toMarkdown()` before display.

### `--json` priority

Both handlers check `options.json` before `options.markdown`. JSON output path is unchanged.
