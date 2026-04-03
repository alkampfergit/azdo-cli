# Implementation Plan: Fix Markdown Field Formatting in Get Item Output

**Branch**: `012-fix-markdown-field-formatting` | **Date**: 2026-04-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/012-fix-markdown-field-formatting/spec.md`

## Summary

The `get-item` command's `formatWorkItem` function currently concatenates field labels and markdown content without any separator, making output unreadable. This plan fixes the formatting so that: (a) single-line markdown values appear as `Label: value` on the same line, and (b) multi-line markdown values start on the line after the label (`Label:\n<content>`). The change is isolated to `src/commands/get-item.ts` with new unit tests in `tests/unit/get-item-markdown.test.ts`.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js LTS (18+)
**Primary Dependencies**: commander.js (CLI), node-html-markdown (HTML→MD conversion)
**Storage**: N/A
**Testing**: vitest
**Target Platform**: Linux/macOS/Windows (cross-platform CLI)
**Project Type**: CLI tool
**Performance Goals**: N/A (output formatting change only)
**Constraints**: Zero new runtime dependencies; backward-compatible with non-markdown mode
**Scale/Scope**: Single function change in one source file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. CLI-First Design | PASS | Output formatting fix, no new commands |
| II. TypeScript Strictness | PASS | Existing strict mode maintained |
| III. Single Responsibility | PASS | Only modifying `formatWorkItem` helper functions |
| IV. npm Distribution | PASS | No new build tooling |
| V. Simplicity | PASS | Minimal change: one helper function; no new abstractions |

All gates pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/012-fix-markdown-field-formatting/
├── plan.md              # This file
├── research.md          # Phase 0 output
└── tasks.md             # Phase 2 output (speckit.tasks)
```

### Source Code (repository root)

```text
src/
└── commands/
    └── get-item.ts      # formatExtraFields + summarizeDescription modified

tests/
└── unit/
    └── get-item-markdown.test.ts   # new tests for formatting rules
```

**Structure Decision**: Single project, modifying one existing file and one existing test file. No new files needed in src/. Follows existing flat module structure.
