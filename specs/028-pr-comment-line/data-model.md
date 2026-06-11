# Data Model: PR Comment Line Number Display

**Branch**: `028-pr-comment-line` | **Date**: 2026-06-10

## Modified Entities

### 1. `AzdoThread` (in `src/types/pull-request.ts`)

Raw ADO API response shape. Expand `threadContext` to expose position fields
the endpoint already returns.

**Before**:
```typescript
export interface AzdoThread {
  id: number;
  status?: string;
  threadContext?: {
    filePath?: string;
  };
  comments: AzdoComment[];
}
```

**After** (additive — no existing field removed):
```typescript
interface CommentPosition {
  line: number;
  offset: number;
}

export interface AzdoThread {
  id: number;
  status?: string;
  threadContext?: {
    filePath?: string;
    rightFileStart?: CommentPosition;
    rightFileEnd?: CommentPosition;
    leftFileStart?: CommentPosition;
    leftFileEnd?: CommentPosition;
  };
  comments: AzdoComment[];
}
```

`CommentPosition` can be a local interface in `pull-request.ts` (not exported —
it is an ADO API detail, not part of the CLI's public contract).

---

### 2. `ActiveCommentThread` (in `src/types/pull-request.ts`)

Internal mapped shape used throughout commands, services, and tests. Gains a
`line` field.

**Before**:
```typescript
export interface ActiveCommentThread {
  id: number;
  status: string;
  threadContext: string | null;   // file path, or null for general threads
  comments: ActivePullRequestComment[];
}
```

**After** (additive):
```typescript
export interface ActiveCommentThread {
  id: number;
  status: string;
  threadContext: string | null;   // file path, or null for general threads
  line: number | null;            // line number from rightFileStart (or leftFileStart fallback)
  comments: ActivePullRequestComment[];
}
```

**Invariants**:
- `line` is always a positive integer or `null` (never 0 or negative).
- `line` is `null` when `threadContext` is `null` (general thread).
- `line` may be `null` even when `threadContext` is non-null (file known but
  no position in the API response).

---

## Mapping Logic (in `src/services/pr-client.ts`)

The `mapThread` and `toActiveCommentThread` functions both apply the same
extraction:

```typescript
const line =
  thread.threadContext?.rightFileStart?.line ??
  thread.threadContext?.leftFileStart?.line ??
  null;
```

This is a pure data extraction — no new API call, no conditional branching on
status or file type.

---

## Output Representation

### Human-readable (`formatThreads` in `src/commands/pr.ts`)

```typescript
// Before
`Thread #${thread.id} [${label}] ${thread.threadContext ?? '(general)'}`

// After
const location = thread.threadContext
  ? `${thread.threadContext}${thread.line !== null ? `:${thread.line}` : ''}`
  : '(general)';
`Thread #${thread.id} [${label}] ${location}`
```

Examples:
- Code-anchored with line: `Thread #69293 [active] /src/foo.ts:42`
- Code-anchored, no line:  `Thread #69293 [active] /src/foo.ts`
- General thread:          `Thread #69293 [active] (general)`

### JSON (`--json` output in `azdo pr comments`)

The `line` field is included automatically because `ActiveCommentThread` now
carries it and the JSON serializer outputs all fields. No formatter change
needed for JSON.

Example thread object:
```json
{
  "id": 69293,
  "status": "active",
  "threadContext": "/src/foo.ts",
  "line": 42,
  "comments": [...]
}
```

General thread:
```json
{
  "id": 69294,
  "status": "active",
  "threadContext": null,
  "line": null,
  "comments": [...]
}
```
