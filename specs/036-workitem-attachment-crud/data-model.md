# Phase 1 Data Model: Work Item Attachment Create/Delete

## WorkItemAttachment (extended)

Existing type at `src/types/work-item.ts`:

```ts
export interface WorkItemAttachment {
  name: string;
  size: number;
  url: string;
}
```

**Change**: add `id: string` — the attachment GUID parsed from `url` (see research.md). Populated the same way for every caller of `extractAttachments()` (`get-item`, `download-attachment`), so existing displays gain the ID for free with no behavior change to existing fields.

```ts
export interface WorkItemAttachment {
  id: string;
  name: string;
  size: number;
  url: string;
}
```

No new top-level entity is introduced — attach/delete operate entirely on the existing `WorkItem.attachments` relation list; there is no local persistence.

## Command inputs (validation rules, from spec FRs)

### `add-attachment <id> <file>`
- `id`: existing `parseWorkItemId()` (positive integer) — FR-001, FR-007.
- `file`: local path; MUST exist and be a regular readable file (not a directory) before any network call — FR-003, Edge Cases.
- `--comment <text>` (optional): passed through verbatim to the relation's `attributes.comment` — FR-010.
- `--org`/`--project`: existing `validateOrgProjectPair()` — FR-009.

### `delete-attachment <id> <filename>`
- `id`: existing `parseWorkItemId()` — FR-004, FR-007.
- `filename`: matched case-sensitively against current `AttachedFile` relation names (same matching the existing `download-attachment` command already uses) — FR-004, FR-006.
- `--id <guid>` (optional): disambiguates when more than one attachment shares `filename` — FR-014, FR-015. Required whenever the filename match is ambiguous, **even with `--yes`** — FR-016.
- `--yes` / `-y` (optional): skip the interactive confirmation prompt — FR-012, FR-013.
- `--org`/`--project`: existing `validateOrgProjectPair()` — FR-009.

## State transitions

- **Attach**: work item revision advances by 1; a new `AttachedFile` relation is appended. No transition on the attachment itself (it has no independent lifecycle in this API surface).
- **Delete**: work item revision advances by 1; the targeted `AttachedFile` relation is removed from the array. Other attachments (including same-filename siblings) are unaffected; their relation array positions may shift, which is why the index is resolved immediately before the delete call, not cached from an earlier read.
