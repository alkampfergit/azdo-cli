# Implementation Plan: Fix Inline Code Span Fidelity for Generic Type Arguments

**Branch**: `032-fix-code-generics` | **Date**: 2026-06-25 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/032-fix-code-generics/spec.md`

## Summary

`set-md-field` / `get-md-field` both lose generic type arguments inside inline code spans. ADO's internal markdown→HTML renderer strips bare `<Something>` when storing the field (confirmed via web UI). On read, the HTML→markdown converter further loses any brackets that survive.

**Two-part fix** — both changes in `src/services/md-convert.ts`:

1. **Upload** (`set-md-field`): export `escapeAnglesInMarkdownCodeSpans(md)` — pre-escapes bare `<`/`>` inside backtick spans before sending to ADO so ADO stores `&lt;HealthCheckResult&gt;`.
2. **Download** (`get-md-field`): private `escapeAnglesInCodeElements(html)` — pre-processes HTML before `NodeHtmlMarkdown.translate()` as a safety net for pre-existing/migrated content.

No new dependencies. No CLI surface changes.

## Technical Context

**Language/Version**: TypeScript 5.x (strict)
**Primary Dependencies**: `node-html-markdown ^2.0.0` (existing), no new dependencies
**Storage**: N/A
**Testing**: vitest (`npm run test:unit`)
**Target Platform**: Node.js LTS (18+)
**Project Type**: CLI (single executable, npm-distributed)
**Performance Goals**: N/A — trivial string pre-processing; no measurable latency impact
**Constraints**: Must not introduce `any`; must not add new runtime dependencies
**Scale/Scope**: Two helper functions + one call site + tests — no structural changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. CLI-First Design | ✅ Pass | No new commands; existing CLI surface unchanged |
| II. TypeScript Strictness | ✅ Pass | Helpers use `string` in/out; no `any` |
| III. Single Responsibility | ✅ Pass | Both helpers in `md-convert.ts`; call site in `set-md-field.ts` is one line |
| IV. npm Distribution | ✅ Pass | No new runtime dependencies; bundle unchanged |
| V. Simplicity (YAGNI) | ✅ Pass | Minimal targeted fix; no abstractions beyond the immediate need |
| VI. ADO API Research | ✅ N/A | No ADO REST API interface changes |

**Post-Phase-1 re-check**: All gates remain ✅.

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
├── services/
│   └── md-convert.ts        ← add escapeAnglesInMarkdownCodeSpans() (export) +
│                                  escapeAnglesInCodeElements() (private)
└── commands/
    └── set-md-field.ts      ← call escapeAnglesInMarkdownCodeSpans(content) before upload

tests/
└── unit/
    └── md-convert.test.ts   ← new tests for both helpers + round-trip regression
```

## Implementation Design

### `src/services/md-convert.ts` — changes

**New exported function** `escapeAnglesInMarkdownCodeSpans(markdown: string): string`:

- Matches every backtick-delimited inline code span: `` `...` `` (non-greedy, single backtick only for now — the common case).
- Inside each span, escapes bare `<` → `&lt;` and `>` → `&gt;`.
- Content outside code spans is not touched.
- Used by `set-md-field.ts` before uploading to ADO.

**New private function** `escapeAnglesInCodeElements(html: string): string`:

- Matches `<code ...>...</code>` blocks in HTML (non-greedy, case-insensitive, dotall).
- Uses placeholder swap to avoid double-encoding already-escaped entities (`&lt;`/`&gt;`).
- Escapes remaining bare `<` → `&lt;` and `>` → `&gt;` inside the block.
- Called inside `htmlToMarkdown()` before `NodeHtmlMarkdown.translate()`.

### `src/commands/set-md-field.ts` — change

In the action handler, wrap `content` with `escapeAnglesInMarkdownCodeSpans()` before the operations array:

```
const safeContent = escapeAnglesInMarkdownCodeSpans(content);
// use safeContent in place of content for the field value operation
```

### `tests/unit/md-convert.test.ts` — tests to add

**Upload helper (`escapeAnglesInMarkdownCodeSpans`):**

| Test | Input | Expected output |
|---|---|---|
| escapes single generic | `` `Task<T>` `` (markdown) | `` `Task&lt;T&gt;` `` |
| escapes nested generics | `` `Func<Task<T>>` `` | `` `Func&lt;Task&lt;T&gt;&gt;` `` |
| escapes multi-param | `` `Dict<K, V>` `` | `` `Dict&lt;K, V&gt;` `` |
| does not touch prose | `prose <b>bold</b>` | unchanged |
| idempotent on already-escaped | `` `Task&lt;T&gt;` `` | `` `Task&lt;T&gt;` `` |

**Download helper (`htmlToMarkdown`):**

| Test | Input HTML | Expected markdown |
|---|---|---|
| preserves single generic | `<code>Task<HealthCheckResult></code>` | `` `Task<HealthCheckResult>` `` |
| preserves nested | `<code>Func<Task<T>></code>` | `` `Func<Task<T>>` `` |
| preserves multi-param | `<code>Dict<K, V></code>` | `` `Dict<K, V>` `` |
| does not double-encode entities | `<code>Task&lt;T&gt;</code>` | `` `Task<T>` `` |
| leaves prose untouched | `<p>plain text</p>` | `plain text` |
| no regression — bold, links | existing tests still pass | (run full suite) |
