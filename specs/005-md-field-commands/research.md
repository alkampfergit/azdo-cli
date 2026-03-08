# Research: Markdown Field Commands

**Date**: 2026-03-06
**Feature**: 005-md-field-commands

## R1: Azure DevOps API — Rich-Text Field Format

**Decision**: Support both HTML reading (with conversion) and native markdown writing via `multilineFieldsFormat`.

**Rationale**: Azure DevOps rich-text fields (System.Description, AcceptanceCriteria, ReproSteps) historically store content as HTML. However, Azure DevOps Services (cloud) now supports a per-field markdown format override via the REST API:

```json
[
  { "op": "add", "path": "/fields/System.Description", "value": "# Heading\nSome **bold** text" },
  { "op": "add", "path": "/multilineFieldsFormat/System.Description", "value": "Markdown" }
]
```

Key facts:
- **Reading**: API returns content in whatever format it was stored in (HTML or markdown). No automatic conversion.
- **Writing**: Can send HTML (universal) or use `multilineFieldsFormat` to set content as native markdown.
- **Caveat**: Setting markdown format is **irreversible** — once a field is saved as markdown, it cannot be reverted to HTML.
- **On-premises**: The markdown format feature may not be available on all Azure DevOps Server versions.

**Alternatives considered**:
1. Always convert markdown to HTML before sending → Works universally but loses native markdown support in the Azure DevOps web UI.
2. Always use `multilineFieldsFormat` → Best experience in web UI but irreversible and may not work on-premises.
3. **Chosen**: Default to `multilineFieldsFormat` for native markdown, matching the spec requirement (FR-009: "ensure the field type is explicitly set to markdown format"). The irreversibility aligns with user intent — if they're using `set-md-field`, they want markdown format.

## R2: HTML-to-Markdown Library Selection

**Decision**: Use `node-html-markdown` as the HTML-to-markdown converter.

**Rationale**: Best fit for a bundled CLI tool distributed via npm.

| Criteria               | node-html-markdown        | turndown                   |
| ---------------------- | ------------------------- | -------------------------- |
| npm weekly downloads   | ~410K                     | ~2.9M                      |
| Dependencies           | 0 (zero)                  | 1 (@mixmark-io/domino)     |
| TypeScript support     | Built-in (native TS)      | Via @types/turndown         |
| Unpacked size          | ~113 kB                   | ~192 kB                    |
| Performance            | ~1.6x faster than turndown | Baseline                  |
| Table support          | Basic                     | Via plugin (turndown-plugin-gfm) |
| Malformed HTML         | Handles gracefully         | Handles gracefully         |

Zero dependencies and native TypeScript types make `node-html-markdown` ideal for tsup bundling (Constitution IV: "Dependencies included at runtime MUST be kept minimal"). Table support in Azure DevOps fields is uncommon enough that basic handling is sufficient.

**Alternatives considered**:
1. `turndown` + `turndown-plugin-gfm` — More battle-tested and better table support, but adds a DOM dependency and separate type definitions. Overkill for this use case.
2. Custom regex-based conversion — Too fragile for real-world HTML, not worth the maintenance burden.

## R3: HTML Detection Heuristic

**Decision**: Use a regex that checks for common HTML tags known to appear in Azure DevOps output.

**Rationale**: The input domain is constrained to Azure DevOps API responses, not arbitrary web content. A targeted regex checking for known AzDO tags is sufficient and fast.

**Pattern**: `/<\/?(p|br|div|span|strong|em|b|i|u|a|ul|ol|li|h[1-6]|table|tr|td|th|img|pre|code)\b/i`

**Logic**:
1. If content matches the HTML tag pattern → run HTML-to-markdown conversion
2. If no match → output as-is (plain text or already markdown)

**Alternatives considered**:
1. Full HTML parser detection — Unnecessarily heavy for this use case.
2. Generic `/<[a-z][\s\S]*>/i` — Too broad, false positives from markdown angle brackets.
3. **Chosen**: Known-tag regex — narrow, fast, and appropriate for the Azure DevOps domain.

## R4: Stdin Auto-Detection

**Decision**: Use `process.stdin.isTTY` to detect whether stdin has piped content.

**Rationale**: Standard Node.js pattern. When `process.stdin.isTTY` is `undefined` (not a terminal), stdin has piped data. When it's `true`, the user is at an interactive terminal with no pipe.

**Logic for content source resolution**:
1. If inline argument provided → use inline (ignore stdin)
2. If `--file` provided → read file (ignore stdin)
3. If neither provided and stdin is not a TTY → read from stdin
4. If neither provided and stdin is a TTY → error with usage message
