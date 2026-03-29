# Data Model: Work Item Create by Type

**Date**: 2026-03-28
**Feature**: 009-work-item-create-type

## Entities

### UpsertInvocation

Represents one CLI invocation of `azdo upsert`.

- **workItemId**: `number | null` — existing work item ID for updates; `null` means create
- **contentSource**: `'inline' | 'file'`
- **content**: `string`
- **sourcePath**: `string | null`
- **requestedType**: `string | null` — raw caller-supplied create type from `--type`

Validation rules:
- Exactly one content source must be supplied.
- `requestedType` is allowed only when `workItemId === null`.
- `requestedType`, when present, must remain non-empty after trimming.

### EffectiveCreateType

Represents the work item type that will actually be used for create mode.

- **value**: `string`
- **source**: `'default' | 'cli-option'`

Rules:
- Defaults to `Task` when `requestedType` is absent.
- Uses the trimmed `requestedType` value when supplied.

### UpsertResult

Represents the command result returned to the caller.

- **action**: `'created' | 'updated'`
- **id**: `number`
- **fields**: `Record<string, unknown>`
- **workItemType**: `string`

Rules:
- `workItemType` comes from the Azure DevOps write response when available.
- Human-readable output must use `workItemType` instead of hard-coding `task`.

## Relationships

- An **UpsertInvocation** resolves to one **EffectiveCreateType** only for create mode.
- The command passes the **EffectiveCreateType** into the existing Azure DevOps create transport.
- The Azure DevOps write response is transformed into one **UpsertResult**.
