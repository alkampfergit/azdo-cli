# Phase 0 Research: Work Item Attachment Create/Delete

Sources consulted (constitution principle VI): Microsoft Learn MCP —
`wit/attachments/create`, `wit/work-items/update` (JSON Patch relations),
`Work Item Batch Update` relation examples, `manage-attachments` (portal
behavior: per-attachment comment, 100 files / 60 MB limits).

## Decision: Upload mechanism

**Decision**: `POST https://dev.azure.com/{org}/{project}/_apis/wit/attachments?fileName={name}&api-version=7.1`, body = raw file bytes, `Content-Type: application/octet-stream`. Response `{ id, url }` (`AttachmentReference`).

**Rationale**: This is the only supported upload endpoint for a single-request (non-chunked) attachment; matches the existing repo's `fetchWithErrors` + `writeHeaders` pattern used by `applyWorkItemPatch`/`createWorkItem`.

**Alternatives considered**: Chunked upload (`uploadType=chunked`) — only needed above ~130 MB; the platform's own 60 MB (Services) / configurable (Server) limit makes chunking unnecessary for this feature. Not implemented; if a future issue needs >130 MB support it is a separate feature.

## Decision: Linking the upload to the work item (and optional comment)

**Decision**: A second call, `PATCH .../_apis/wit/workitems/{id}` (existing `applyWorkItemPatch`), with a JSON Patch op:
```json
{ "op": "add", "path": "/relations/-", "value": { "rel": "AttachedFile", "url": "<attachment url from upload step>", "attributes": { "comment": "<optional>" } } }
```
`attributes.comment` is the same field the web portal's "Add/Edit comment" action on an attachment writes to — confirmed via `manage-attachments` docs. Omit the `attributes` object entirely when no `--comment` was given.

**Rationale**: Matches the documented two-step "Attach a file to a work item" flow (`wit/?view=azure-devops-rest-7.1#common-tasks`) and reuses the existing generic PATCH helper — no new low-level HTTP function needed beyond the upload call.

## Decision: Per-attachment ID for delete disambiguation (owner-approved, Clarifications session 2026-08-27)

**Decision**: The "ID" surfaced to the user (FR-002, FR-014, FR-015) is the attachment GUID already embedded in the relation's `url` (`.../_apis/wit/attachments/{guid}?fileName=...`). Reuse the existing `ATTACHMENT_GUID_RE` extraction pattern already present in `src/services/image-download.ts` rather than inventing a second regex.

**Rationale**: No separate ID-issuing call exists in the API; the GUID is already returned by both the upload response and the relation URL, so it's free to expose and stable across the attachment's lifetime.

## Decision: Deleting (unlinking) an attachment

**Decision**: Azure DevOps has no attachment-scoped delete endpoint reachable from a work item context — an attachment is removed by removing its `AttachedFile` relation from the work item via `PATCH` with `{ "op": "remove", "path": "/relations/{index}" }`, where `{index}` is the **array position** of that relation in the work item's current `relations` list, not the attachment GUID. This requires a fresh `$expand=relations` fetch immediately before the delete PATCH (existing `fetchWorkItemResponse(..., { includeRelations: true })`), scanning for the matching `AttachedFile` relation(s) by GUID, and using its position.

**Rationale**: This is the same mechanism Azure Boards' own "Delete" attachment action uses under the hood (soft-unlink from the work item; the underlying blob is not addressable for a hard delete via this API surface, consistent with FR's "source file... untouched" framing — here "source" is the server-side blob, left alone). The existing `getWorkItem()` → `extractAttachments()` path deliberately drops relation index (it's irrelevant to read/download), so `delete-attachment` needs its own small fetch+scan step rather than reusing `getWorkItem()` as-is.

**Alternatives considered**: A dedicated "delete attachment" REST resource — does not exist for work item attachments (unlike, e.g., PR attachments in some other Azure DevOps areas). Confirmed via Learn search; only the relation-removal approach is documented for work items.

## Decision: Confirmation prompt implementation

**Decision**: Reuse the existing `promptYesNo` prompt pattern from `src/commands/auth.ts` (auto-confirms when `stdin` is not a TTY, otherwise blocks on a `[y/N]` read). Lift it into `src/services/command-helpers.ts` as a shared export (`promptYesNo`) since it will now have two callers (`auth.ts`, the new `delete-attachment.ts`) — avoids duplicating the readline handling.

**Rationale**: Constitution Simplicity principle — no new prompt library, reuse what's proven; Single Responsibility — shared prompt logic belongs in the shared helpers module, not copied.

## Decision: Client-side limits

**Decision**: Do not pre-validate the platform's 100-attachments / 60 MB-per-file limits client-side. Surface the server's own `BAD_REQUEST`/`UPDATE_REJECTED` message via the existing `handleCommandError` mapping.

**Rationale**: Matches the spec's Assumptions section (owner-unchallenged) and Simplicity — the limit is server-configurable (Server product allows a different max), so hard-coding it client-side would drift.

## Addendum (implementation time): `AttachedFile` relation upload-date attribute key

**Decision**: `resourceCreatedDate`. Read `r.attributes.resourceCreatedDate` (falling back to
`resourceModifiedDate`, then to `undefined`/"unknown" if neither is present) when building the
ambiguous-delete candidate listing.

**Rationale**: Microsoft Learn's `Attachment.CreatedDate` property is documented as "the time the
attachment was uploaded" for the underlying attachment resource; this repo's existing
`extractAttachments()` already reads `r.attributes.resourceSize` for the same `AttachedFile`
relation's size, confirming Azure DevOps exposes attachment-resource properties on the relation
under a `resource<PropertyName>` naming convention. No single Learn page renders the full example
JSON body for "Add an attached file" (the `workitembatchupdate` doc's example tabs don't render
in fetched markdown), so this is inferred from the confirmed `resourceSize` precedent plus the
`CreatedDate` semantics, with a graceful fallback if the key is ever absent.
