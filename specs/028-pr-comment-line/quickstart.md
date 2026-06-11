# Quickstart: PR Comment Line Number Display

**Branch**: `028-pr-comment-line` | **Date**: 2026-06-10

## What changed (one paragraph)

The `azdo pr comments` command now displays the line number for each
code-anchored comment thread. The ADO PR threads API has always returned
`rightFileStart` and `leftFileStart` position objects inside `threadContext`
— the CLI was simply discarding them. This feature expands the `AzdoThread`
type to capture those fields, extracts the line number in the mapper, adds a
`line: number | null` field to `ActiveCommentThread`, and updates the
human-readable formatter to append `:N` after the file path. The `--json`
output gains `line` automatically.

## Files to touch (in order)

| File | Change |
|------|--------|
| `src/types/pull-request.ts` | Add `CommentPosition` interface; expand `AzdoThread.threadContext`; add `line: number \| null` to `ActiveCommentThread` |
| `src/services/pr-client.ts` | Extract `line` in `mapThread()` and `toActiveCommentThread()` |
| `src/commands/pr.ts` | Update `formatThreads()` to append `:N` when `thread.line !== null` |
| `tests/unit/pr-client.test.ts` | Add 4 new test cases; update existing `ActiveCommentThread` fixtures to include `line: null` |
| `tests/unit/pr-comments.test.ts` | Update fixtures; add `:N` assertions where applicable |
| `tests/unit/pr-comments-filters.test.ts` | Update fixtures to include `line: null` |

## Step-by-step implementation

### Step 1 — `src/types/pull-request.ts`

1. Add `CommentPosition` interface (not exported) just before `AzdoThread`.
2. Expand `AzdoThread.threadContext` optional fields to include
   `rightFileStart?: CommentPosition` and `leftFileStart?: CommentPosition`
   (also `rightFileEnd` and `leftFileEnd` for completeness, though unused).
3. Add `line: number | null` to `ActiveCommentThread` after `threadContext`.

### Step 2 — `src/services/pr-client.ts`

In both `mapThread` and `toActiveCommentThread`:

```typescript
const line =
  thread.threadContext?.rightFileStart?.line ??
  thread.threadContext?.leftFileStart?.line ??
  null;
```

Add `line` to the returned object literal.

### Step 3 — `src/commands/pr.ts`

In `formatThreads`, replace the single-expression thread header with:

```typescript
const location = thread.threadContext
  ? `${thread.threadContext}${thread.line !== null ? `:${thread.line}` : ''}`
  : '(general)';
lines.push('', `Thread #${thread.id} [${threadStatusLabel(thread.status)}] ${location}`);
```

### Step 4 — Tests

**`pr-client.test.ts`** — add test cases for `mapThread`:
- Input with `rightFileStart: { line: 42, offset: 1 }` → `line: 42`
- Input with `rightFileStart` absent, `leftFileStart: { line: 7, offset: 3 }` → `line: 7`
- Input with `threadContext` present but no position fields → `line: null`
- Input with `threadContext` absent (general thread) → `line: null`

Update all existing `ActiveCommentThread` fixtures to add `line: null`.

**`pr-comments.test.ts`** — update fixtures; add assertions that the
formatted output contains `:42` for threads with a known line.

**`pr-comments-filters.test.ts`** — update fixtures to add `line: null`.

## Verify

```bash
npm run lint
npm test
npm run build
```

All three must exit 0.
