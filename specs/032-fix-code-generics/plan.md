# Implementation Plan: Fix Inline Code Span Fidelity for Generic Type Arguments

**Branch**: `032-fix-code-generics` | **Date**: 2026-06-25 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/032-fix-code-generics/spec.md`

## Summary

`get-md-field` silently drops generic type arguments (e.g. `<HealthCheckResult>`) from inline code spans when converting ADO HTML field values back to markdown. The HTML parser inside `node-html-markdown` treats bare `<Something>` inside `<code>` elements as unknown HTML tags and discards them.

**Fix**: add a private `escapeAnglesInCodeElements()` helper in `src/services/md-convert.ts` that HTML-escapes bare `<` / `>` inside `<code>` elements before the string reaches `NodeHtmlMarkdown.translate()`. The function is idempotent (already-escaped entities are not double-encoded). Add regression-preventing unit tests in `tests/unit/md-convert.test.ts`.

## Technical Context

**Language/Version**: TypeScript 5.x (strict)
**Primary Dependencies**: `node-html-markdown ^2.0.0` (existing), no new dependencies
**Storage**: N/A
**Testing**: vitest (`npm run test:unit`)
**Target Platform**: Node.js LTS (18+)
**Project Type**: CLI (single executable, npm-distributed)
**Performance Goals**: N/A — trivial string pre-processing; no measurable latency impact
**Constraints**: Must not introduce `any`; must not add new runtime dependencies
**Scale/Scope**: Single function change + tests — no structural changes to commands or services

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. CLI-First Design | ✅ Pass | No new commands; existing `get-md-field` CLI surface unchanged |
| II. TypeScript Strictness | ✅ Pass | Helper uses `string` in/out; no `any` |
| III. Single Responsibility | ✅ Pass | Fix is isolated to `md-convert.ts`; no logic mixed with command layer |
| IV. npm Distribution | ✅ Pass | No new runtime dependencies; bundle unchanged |
| V. Simplicity (YAGNI) | ✅ Pass | Minimal targeted fix; no abstractions beyond the immediate need |
| VI. ADO API Research | ✅ N/A | No ADO REST API changes in this fix |

**Post-Phase-1 re-check**: All gates remain ✅. No new patterns introduced.

## Project Structure

### Documentation (this feature)

```text
specs/032-fix-code-generics/
├── plan.md         ← this file
├── research.md     ← Phase 0 output
├── data-model.md   ← Phase 1 output
└── tasks.md        ← Phase 2 output (speckit-tasks)
```

No `contracts/` or `quickstart.md` — no new CLI interface; no API surface change.

### Source Code (files touched)

```text
src/
└── services/
    └── md-convert.ts        ← add escapeAnglesInCodeElements() helper

tests/
└── unit/
    └── md-convert.test.ts   ← add failing test (reproduce bug) + verify fix passes
```

No other source files are modified.

## Implementation Design

### `src/services/md-convert.ts` — change

Add a private `escapeAnglesInCodeElements(html: string): string` function that:

1. Matches every `<code` ... `>` ... `</code>` block (non-greedy, case-insensitive, dotall).
2. For the captured block content:
   a. Replaces existing `&lt;` with a control-char placeholder (`\x01`) — protects already-escaped entities.
   b. Replaces existing `&gt;` with a control-char placeholder (`\x02`).
   c. Replaces remaining bare `<` → `&lt;`.
   d. Replaces remaining bare `>` → `&gt;`.
   e. Restores `\x01` → `&lt;` and `\x02` → `&gt;`.
3. Returns the full HTML string with only `<code>` block internals modified.

Update `htmlToMarkdown()` to call `escapeAnglesInCodeElements(html)` before `NodeHtmlMarkdown.translate()`.

### `tests/unit/md-convert.test.ts` — tests to add

All new tests go inside the existing `describe('htmlToMarkdown', ...)` block.

| Test name | Input HTML | Expected markdown output contains |
|---|---|---|
| preserves single generic type arg in code span | `<code>Task<HealthCheckResult></code>` | `` `Task<HealthCheckResult>` `` |
| preserves nested generic type args | `<code>Func<Task<HealthCheckResult>></code>` | `` `Func<Task<HealthCheckResult>>` `` |
| preserves multiple type parameters | `<code>Dictionary<TKey, TValue></code>` | `` `Dictionary<TKey, TValue>` `` |
| does not double-encode already-escaped entities | `<code>Task&lt;T&gt;</code>` | `` `Task<T>` `` |
| does not touch content outside code spans | `<p>prose <em>italic</em></p>` | unchanged prose + italic |
| preserves code spans with no generics | `<code>var x = 1</code>` | `` `var x = 1` `` |
