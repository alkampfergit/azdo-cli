# Data Model: Fix Inline Code Span Fidelity for Generic Type Arguments

**Branch**: `032-fix-code-generics` | **Date**: 2026-06-25

## Overview

This is a pure text-transformation bug fix. There are no new persisted entities, no schema changes, and no storage modifications. The only "model" relevant to this feature is the in-memory string transformation pipeline.

## Transformation Pipeline (existing, unchanged interface)

```
Input: HTML string (from ADO rich-text field)
         │
         ▼
  escapeAnglesInCodeElements(html)   ← NEW internal step
         │
         ▼
  NodeHtmlMarkdown.translate(html)
         │
         ▼
Output: Markdown string
```

### escapeAnglesInCodeElements — internal function (new)

| Aspect | Detail |
|---|---|
| Input | HTML string that may contain `<code ...>...</code>` elements with bare `<` / `>` inside |
| Output | Same HTML string with bare `<` → `&lt;` and `>` → `&gt;` inside `<code>` blocks only |
| Side effects | None — pure function |
| Exported | No — private to `md-convert.ts` |

#### Invariants

- Already-escaped entities (`&lt;`, `&gt;`) are preserved unchanged (idempotent).
- Text outside `<code>` elements is not modified.
- The opening tag (including any `class` or `style` attributes on `<code>`) is preserved.
- Nesting of angle brackets (e.g. `Func<Task<T>>`) is handled correctly because both `<` and `>` are escaped independently.

## No New Contracts

`htmlToMarkdown(html: string): string` and `toMarkdown(content: string): string` retain their existing signatures. No new public exports.
