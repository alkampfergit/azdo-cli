# Data Model: Markdown Field Commands

**Date**: 2026-03-06
**Feature**: 005-md-field-commands

## Entities

### ContentSource

Represents the resolved source of markdown content for `set-md-field`.

- **type**: `'inline' | 'file' | 'stdin'` — how the content was provided
- **content**: `string` — the resolved markdown text to send

Resolution precedence: inline > file > stdin.

### ContentFormat

Represents the detected format of a field value returned by the Azure DevOps API.

- **format**: `'html' | 'markdown' | 'plaintext'` — detected content type
- **content**: `string` — the raw field value from the API

Detection logic: if content matches known HTML tag pattern, format is `html`; otherwise `markdown` or `plaintext` (treated identically — output as-is).

### FieldUpdatePayload

The JSON Patch operations sent to the Azure DevOps API when setting a markdown field.

- **fieldPath**: `string` — e.g., `/fields/System.Description`
- **fieldValue**: `string` — the markdown content
- **formatPath**: `string` — e.g., `/multilineFieldsFormat/System.Description`
- **formatValue**: `'Markdown'` — always "Markdown" for this command

This maps to two JSON Patch operations:
1. `{ op: "add", path: fieldPath, value: fieldValue }`
2. `{ op: "add", path: formatPath, value: "Markdown" }`

## Relationships

- `set-md-field` command resolves a **ContentSource** → builds a **FieldUpdatePayload** → sends to Azure DevOps API via existing `updateWorkItem` service (extended to accept additional operations).
- `get-md-field` command retrieves raw field value → detects **ContentFormat** → if HTML, converts to markdown → outputs to stdout.

## State Transitions

No state machines apply. Both commands are stateless request-response operations.

## Validation Rules

- Work item ID: positive integer (existing validation in `set-field` command)
- Field name: non-empty string (reference name like `System.Description` or friendly name)
- File path (when `--file`): must exist and be readable
- Content: must be non-empty from at least one source (inline, file, or stdin)
- Mutually exclusive: inline content and `--file` cannot both be specified
