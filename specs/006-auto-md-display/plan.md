# Implementation Plan: Auto Markdown Display for Rich Text Fields

**Branch**: `006-auto-md-display` | **Date**: 2026-03-09 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-auto-md-display/spec.md`

## Summary

Add a persistent `markdown` config setting and per-command `--markdown`/`--no-markdown` flags to `get-item` so that rich text (HTML) fields are automatically converted to readable markdown. Leverages the existing `toMarkdown()` / `isHtml()` infrastructure from the 005-md-field-commands feature. No new dependencies required.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: commander.js (CLI framework), node-html-markdown (HTML→MD, existing)
**Storage**: `~/.azdo/config.json` (existing config file, new `markdown` boolean key)
**Testing**: vitest
**Target Platform**: Node.js LTS (18+)
**Project Type**: CLI tool
**Performance Goals**: N/A (local config read + string conversion, negligible overhead)
**Constraints**: Must be fully backward compatible — default behavior unchanged
**Scale/Scope**: 3 files modified, ~50 lines of new/changed code

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. CLI-First Design | PASS | New `--markdown`/`--no-markdown` flags follow POSIX conventions. Config setting uses existing `config set/get` commands. |
| II. TypeScript Strictness | PASS | New `markdown?: boolean` field is typed. No `any` usage. |
| III. Single Responsibility | PASS | No new commands — extends existing `get-item` with an output mode toggle. Shared logic stays in services. |
| IV. npm Distribution | PASS | No new dependencies. Existing `node-html-markdown` already bundled. |
| V. Simplicity | PASS | Minimal change: one new config key, one new flag pair, one conditional in `formatWorkItem()`. No new abstractions. |

**Post-design re-check**: All gates still pass. Design adds no abstractions, no new dependencies, no new commands.

## Project Structure

### Documentation (this feature)

```text
specs/006-auto-md-display/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── cli-contract.md
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── types/
│   └── work-item.ts         # Add markdown?: boolean to CliConfig
├── services/
│   ├── config-store.ts       # Add markdown setting + boolean handling
│   ├── md-convert.ts         # (no changes — already provides toMarkdown())
│   └── html-detect.ts        # (no changes — already provides isHtml())
└── commands/
    └── get-item.ts           # Add --markdown/--no-markdown, modify formatWorkItem()

tests/
└── unit/
    ├── config-store.test.ts  # Add tests for markdown boolean setting
    └── get-item-markdown.test.ts  # New: test markdown flag/config combinations
```

**Structure Decision**: Follows existing flat module structure. No new directories or service modules needed.
