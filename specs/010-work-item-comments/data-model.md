# Data Model: Work Item Comments

**Date**: 2026-03-28
**Feature**: 010-work-item-comments

## Entities

### WorkItemComment

Represents one returned Azure DevOps comment on a work item.

- **id**: `number` — comment identifier
- **workItemId**: `number` — owning work item identifier
- **text**: `string` — visible comment text exactly as returned by Azure DevOps
- **author**: `string | null` — display name of the comment author
- **createdAt**: `string | null` — creation timestamp
- **modifiedAt**: `string | null` — last modification timestamp
- **isDeleted**: `boolean` — deletion marker from Azure DevOps
  
Validation and rules:
- Default list results exclude comments where `isDeleted === true`.
- Human-readable output falls back to `Unknown` when `author` is null.

### WorkItemCommentsResult

Represents the result of `azdo comments list`.

- **workItemId**: `number`
- **count**: `number` — number of comments returned after filtering
- **comments**: `WorkItemComment[]` — newest-first ordered visible comments

Rules:
- `comments` are ordered newest first.
- `count` equals `comments.length`.
- Empty history is a successful result with `count === 0`.

### AddWorkItemCommentResult

Represents the result of `azdo comments add`.

- **workItemId**: `number`
- **commentId**: `number`
- **text**: `string`
- **author**: `string | null`
- **createdAt**: `string | null`
- **url**: `string | null`

Rules:
- `text` is the submitted comment body as stored by Azure DevOps.
- Human-readable success output must identify both `workItemId` and `commentId`.

### CommentCommandInvocation

Represents one CLI invocation targeting work item comments.

- **mode**: `'list' | 'add'`
- **workItemId**: `number`
- **text**: `string | null` — required only in add mode
- **json**: `boolean`
- **orgOverride**: `string | null`
- **projectOverride**: `string | null`

Validation rules:
- `workItemId` must be a positive integer.
- `text` is required for `mode === 'add'`.
- `text`, when present, must remain non-empty after trimming.

## Relationships

- One **CommentCommandInvocation** in `list` mode resolves to one **WorkItemCommentsResult**.
- One **CommentCommandInvocation** in `add` mode produces one **AddWorkItemCommentResult**.
- One **WorkItemCommentsResult** contains zero or more **WorkItemComment** entities for the same work item.
