# Quickstart: Markdown Field Commands

**Feature**: 005-md-field-commands

## Prerequisites

- Azure DevOps CLI (`azdo`) installed and configured with a PAT
- Organization and project set via `azdo config` or `--org`/`--project` flags

## New Dependency

```bash
npm install node-html-markdown
```

Zero-dependency HTML-to-markdown converter with native TypeScript types.

## New Files to Create

```
src/commands/get-md-field.ts    # get-md-field command
src/commands/set-md-field.ts    # set-md-field command
src/services/html-detect.ts     # HTML detection heuristic
src/services/md-convert.ts      # HTML-to-markdown conversion wrapper
```

## Register Commands

In `src/index.ts`, add:

```typescript
import { createGetMdFieldCommand } from './commands/get-md-field.js';
import { createSetMdFieldCommand } from './commands/set-md-field.js';

program.addCommand(createGetMdFieldCommand());
program.addCommand(createSetMdFieldCommand());
```

## Key Implementation Notes

1. **Content source resolution** (`set-md-field`): Check inline arg first, then `--file`, then `process.stdin.isTTY` for stdin auto-detection.

2. **HTML detection** (`get-md-field`): Use regex `/<\/?(p|br|div|span|strong|em|b|i|u|a|ul|ol|li|h[1-6]|table|tr|td|th|img|pre|code)\b/i` to detect HTML in API response.

3. **Markdown format flag** (`set-md-field`): Send two JSON Patch operations — one for the field value and one for `/multilineFieldsFormat/<field>` set to `"Markdown"`.

4. **Reuse existing patterns**: Follow `src/commands/set-field.ts` for context resolution, auth, error handling. Extract shared `resolveContext` if not already shared.
