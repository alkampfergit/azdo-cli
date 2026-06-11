# PR Report: PR Comment Line Number Display

**Branch**: `028-pr-comment-line`
**Date**: 2026-06-10
**Spec**: [specs/028-pr-comment-line/spec.md](specs/028-pr-comment-line/spec.md)

## Summary

`azdo pr comments` now displays the line number alongside the file path for each code-anchored comment thread (e.g. `/src/foo.ts:42`). The Azure DevOps threads endpoint has always returned `rightFileStart`/`leftFileStart` position data inside `threadContext`; the CLI was discarding it. This PR expands the type layer to capture those fields, extracts the line number during mapping, and surfaces it in both human-readable and `--json` output.

## What's New

- **`src/types/pull-request.ts` — ADO type expansion**: Added `CommentPosition` interface; expanded `AzdoThread.threadContext` to include `rightFileStart`, `rightFileEnd`, `leftFileStart`, `leftFileEnd` position fields that the API already returns.
- **`src/types/pull-request.ts` — internal model**: `ActiveCommentThread` gains `line: number | null` — positive integer when a line position is known, `null` for general threads or when the API provides no position.
- **`src/services/pr-client.ts` — mapper**: `mapThread()` and `toActiveCommentThread()` now extract `line` from `rightFileStart.line` (primary) with `leftFileStart.line` as fallback.
- **`src/commands/pr.ts` — formatter**: `formatThreads()` appends `:<line>` after the file path when `line` is non-null. General threads and threads without position data are unchanged.
- **`--json` output**: `line` field added to each thread object automatically; `threadContext` remains a `string | null` for backward compatibility.

## Testing

- **Unit — mapper**: 4 new test cases in `tests/unit/pr-client.test.ts` covering right-side line, left-side fallback, file-only (no position), and general thread.
- **Unit — formatter**: assertions in `tests/unit/pr-comments.test.ts` verify `:N` suffix present when `line` is known, absent when null, and `(general)` unchanged.
- **Unit — JSON**: assertion verifies `line` field present in serialised output for both code-anchored and general threads.
- **Regression**: existing fixtures in `pr-comments-filters.test.ts`, `pr-comment-state.test.ts`, `pr-status.test.ts` updated with `line: null` — all existing behaviour preserved.

## Notes

- `offset` (column) is intentionally not exposed; only `line` is shown.
- No new runtime dependencies added.

Closes #61
