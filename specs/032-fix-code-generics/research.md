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

## R5: ADO Upload Also Affected — Upload Pre-Processing Required

**Decision**: `set-md-field` MUST pre-process the markdown to escape bare `<` / `>` inside backtick inline code spans before sending to ADO. An `escapeAnglesInMarkdownCodeSpans(markdown: string): string` helper is exported from `md-convert.ts` and called in `set-md-field`.

**Rationale**: Owner confirmed (Plan approval phase) that the Azure DevOps web UI also shows stripped content after upload — `Task<HealthCheckResult>` becomes `Task`. This means ADO's internal markdown→HTML renderer discards unescaped angle brackets inside code spans before storage. Pre-escaping (`<` → `&lt;`, `>` → `&gt;`) in the markdown source before upload causes ADO's renderer to store `&lt;HealthCheckResult&gt;` as proper HTML entities, which survive to the GET response and are correctly decoded by `NodeHtmlMarkdown`.

**Alternatives considered**:
- *Convert markdown to HTML client-side (e.g. `marked` library) and upload HTML*: Reliable but adds a new dependency (violates Constitution §V). Not chosen.
- *Leave upload unchanged and only fix the download path*: Insufficient — the data is already corrupted in ADO storage, so fields viewed in the web UI are wrong regardless of CLI fixes.

**Risk note**: If ADO double-encodes `&lt;` when processing markdown code spans (i.e., stores `&amp;lt;` rather than `&lt;`), the round-trip would produce `&lt;HealthCheckResult&gt;` in the markdown output instead of `<HealthCheckResult>`. This should be verified against a real ADO instance. The download-path fix's `escapeAnglesInCodeElements()` would handle the `&amp;lt;` case correctly if it arises. (See edge-case note in data-model.)

No ADO REST API surface changes — `set-md-field` still uses the same `updateWorkItem` call with `multilineFieldsFormat: Markdown`; only the `value` string is pre-processed.
