# Research: Fix Inline Code Span Fidelity for Generic Type Arguments

**Branch**: `032-fix-code-generics` | **Date**: 2026-06-25

## R1: Root-Cause Confirmation

**Decision**: The data loss occurs inside `NodeHtmlMarkdown.translate()` at the HTML-parse stage, not in the markdown-output stage.

**Rationale**: `node-html-markdown` v2 uses an internal HTML tree parser. When the HTML string `<code>Task<HealthCheckResult></code>` is parsed, the parser encounters `<HealthCheckResult>` and treats it as an unknown open tag. It creates a phantom element node, places the subsequent text (`</code>` closing tag is then interpreted as closing the phantom element rather than the outer `<code>` element), and discards the phantom node's content. By the time the `code` translator runs, `node.innerText` only contains `Task`.

**Alternatives considered**:
- *Rely on a NodeHtmlMarkdown option*: Investigated all options exposed via `NodeHtmlMarkdownOptions`; none control how the HTML parser handles unrecognised tags. Not viable.
- *Replace the library*: Would be a breaking change with wider regression risk. Violates YAGNI (Constitution §V).
- *Post-process the markdown output*: The angle-bracket content is already gone before the translator runs; there is nothing to restore.

## R2: Fix Strategy — Pre-Processing the HTML String

**Decision**: Add a private `escapeAnglesInCodeElements(html: string): string` helper that runs before `NodeHtmlMarkdown.translate()`. It finds every `<code ...>...</code>` block in the HTML string and HTML-escapes any bare `<` and `>` characters inside the block content, while leaving already-escaped entities (`&lt;`, `&gt;`) untouched.

**Rationale**: The fix is minimal (one small pure function), entirely within `src/services/md-convert.ts`, requires no new dependencies, passes Constitution §V (simplicity), and is fully reversible if the library fixes the issue upstream.

**Alternatives considered**:
- *Patch the HTML string globally (all `<` / `>`)*: Would corrupt the outer HTML tags that the parser needs. Not viable.
- *Parse with a full DOM parser first*: Adds a new dependency; disproportionate to the problem scope. Violates Constitution §V.

## R3: Double-Escape Protection

**Decision**: Before escaping bare `<` / `>`, replace the existing entity sequences (`&lt;` → placeholder, `&gt;` → placeholder), apply the bare-bracket escaping, then restore the placeholders. Placeholders are control characters (`\x01`, `\x02`) that cannot appear in legal HTML content.

**Rationale**: Fields that already contain properly escaped HTML entities (e.g. from an older ADO version that escapes correctly) must not be double-encoded into `&amp;lt;`. The placeholder swap guarantees idempotency.

## R4: Scope — `<code>` Only, Not `<pre>`

**Decision**: Apply the pre-processor only to `<code[^>]*>...</code>` elements. Do not process `<pre>` blocks directly.

**Rationale**: ADO's markdown renderer typically produces `<pre><code>...</code></pre>` for fenced code blocks and HTML-escapes angle brackets in that context already. The reported failures are all in inline code spans. If `<pre>` blocks with unescaped brackets are reported separately, a follow-up issue is the correct vehicle; mixing both here would widen the regex scope unnecessarily.

**Note**: The fix does correctly handle `<code>` elements nested inside `<pre>` — the regex matches the inner `<code>` tag, escapes its content, and leaves the outer `<pre>` tag untouched. This is safe.

## R5: ADO API — No Changes Required

**Decision**: No changes to `set-md-field`, `get-md-field`, or `azdo-client.ts`. The upload path (markdown → ADO via `multilineFieldsFormat: Markdown`) is correct. The problem is entirely in the read-back conversion path.

**Rationale**: Confirmed by inspecting `src/commands/set-md-field.ts` — content is sent as raw markdown with the format flag, and ADO stores/returns it as HTML. The conversion failure is client-side.

No ADO REST API research was required for this fix (Constitution §VI scope: ADO API changes only).
