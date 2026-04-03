# Data Model: Comments Markdown Support

**Branch**: `013-comments-markdown` | **Date**: 2026-04-03

## Entities

### WorkItemComment (existing — no changes)

| Field | Type | Notes |
|-------|------|-------|
| id | number | Comment ID |
| workItemId | number | Parent work item |
| text | string | Raw comment body (HTML, markdown, or plain text) |
| author | string \| null | Display name |
| createdAt | string \| null | ISO date |
| modifiedAt | string \| null | ISO date |
| isDeleted | boolean | Soft-delete flag |

### AddWorkItemCommentResult (existing — no changes)

| Field | Type | Notes |
|-------|------|-------|
| workItemId | number | Parent work item |
| commentId | number | New comment ID |
| text | string | Stored text as returned by API |
| author | string \| null | Display name |
| createdAt | string \| null | ISO date |
| url | string \| null | Direct link |

## Format Parameter (new — internal)

A string literal union `'html' | 'markdown'` passed to `addWorkItemComment` in `azdo-client.ts` when constructing the POST body. It maps directly to the `format` field in the Azure DevOps API request body.

**Not stored** in any type file — it is a parameter, not a data entity.
