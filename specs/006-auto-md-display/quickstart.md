# Quickstart: Auto Markdown Display

**Feature**: 006-auto-md-display

## What This Feature Does

Adds the ability to automatically display rich text (HTML) work item fields as readable markdown when using `get-item`, controlled via a persistent config setting or per-command flag.

## Key Files to Modify

| File | Change |
|------|--------|
| `src/types/work-item.ts` | Add `markdown?: boolean` to `CliConfig` |
| `src/services/config-store.ts` | Add `markdown` to `SETTINGS`, handle boolean type in `setConfigValue()` |
| `src/commands/get-item.ts` | Add `--markdown`/`--no-markdown` options, use `toMarkdown()` when active |

## Key Files to Reference (no changes)

| File | Why |
|------|-----|
| `src/services/md-convert.ts` | `toMarkdown()` — the conversion function to use |
| `src/services/html-detect.ts` | `isHtml()` — used internally by `toMarkdown()` |
| `src/commands/get-md-field.ts` | Reference for how `toMarkdown()` is used today |

## Implementation Order

1. Extend `CliConfig` type with `markdown?: boolean`
2. Add `markdown` setting definition to config store + boolean handling
3. Add `--markdown`/`--no-markdown` flags to `get-item` command
4. Modify `formatWorkItem()` to accept markdown parameter and use `toMarkdown()` when active
5. Write tests for all combinations (config on/off × flag on/off/absent)

## Testing Quick Reference

```bash
npm test          # Run all tests
npm run lint      # Lint check
npm run build     # Build check
```
