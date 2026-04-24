# Implementation Plan: Fix PAT Input Visibility Bug

**Branch**: `015-fix-pat-visibility` | **Date**: 2026-04-09 | **Spec**: [spec.md](spec.md)

## Summary

The PAT prompt in `src/services/auth.ts` exposes raw PAT characters on a separate terminal line when the user pastes. Root cause: `createInterface` is called with `output: process.stderr`, causing readline to echo all received characters to stderr before the raw-mode `onData` handler can render the masked display. Fix: set `output: null` on the readline interface to disable automatic echoing, since all terminal output is already handled manually via `process.stderr.write`.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js LTS  
**Primary Dependencies**: Node.js built-in `readline`, `process.stdin` raw mode  
**Storage**: N/A  
**Testing**: vitest  
**Target Platform**: Linux/macOS/Windows terminal (TTY)  
**Project Type**: CLI tool  
**Performance Goals**: N/A (single-user interactive prompt)  
**Constraints**: Must not break existing backspace/Enter/Ctrl+C handling; must not break non-TTY path  
**Scale/Scope**: Single file change in `src/services/auth.ts`

## Constitution Check

- [X] CLI-First Design: fix applies to CLI prompt behavior
- [X] TypeScript Strictness: no type changes needed; `null` is a valid `output` value for `readline.createInterface`
- [X] Single Responsibility: the fix is scoped to the PAT prompt function only
- [X] Simplicity: one-line change; no new abstractions

No violations.

## Project Structure

### Documentation (this feature)

```text
specs/015-fix-pat-visibility/
├── plan.md              # This file
├── research.md          # Phase 0 output
└── tasks.md             # Phase 4 output
```

### Source Code (affected files)

```text
src/
└── services/
    └── auth.ts          # promptForPat() — the only file changed

tests/
└── unit/
    └── auth.test.ts     # Existing tests (no changes expected; all should still pass)
```

## Phase 0: Research

See [research.md](research.md).
