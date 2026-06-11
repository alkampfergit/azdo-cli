# Research: PR Comment Line Number Display

**Branch**: `028-pr-comment-line` | **Date**: 2026-06-10

## Decision 1 — Primary line-number source

**Decision**: Use `threadContext.rightFileStart.line` as the primary value;
fall back to `threadContext.leftFileStart.line` if absent.

**Rationale**: The "right file" is the new (post-change) version, which is
what reviewers see in the PR diff. `rightFileStart` is the position where the
comment thread begins in that view. `leftFileStart` represents the same
position in the old (base) version — available for threads anchored to deleted
lines. Using right-first, left-fallback ensures the displayed line is as
close as possible to the reviewer's current view.

**Alternatives considered**:
- Left-file only: would show stale lines for comments on new code.
- Always right, no fallback: would show no line for threads on deleted lines.
- Show both (e.g. `file.ts:L42 → R45`): too verbose; not requested by the issue.

**Source**: Confirmed via Microsoft Learn
([`CommentThreadContext`](https://learn.microsoft.com/javascript/api/azure-devops-extension-api/commentthreadcontext))
and Context7 ADO REST API reference (PR threads GET response example).

---

## Decision 2 — `CommentPosition` field name

**Decision**: The field is named `line` (integer, 1-based) as returned by the
ADO REST API. The companion `offset` field (column) is intentionally out of
scope.

**Rationale**: Official API JSON example:
```json
"rightFileStart": { "line": 5, "offset": 1 }
```
Field name `line` is stable across API versions 5.x–7.1.

**Source**: Context7 ADO REST API reference (PR threads GET response example,
`api-version=7.1`).

---

## Decision 3 — No new API call needed

**Decision**: The existing `GET .../pullRequests/{prId}/threads` response
already includes `threadContext.rightFileStart` / `leftFileStart`. The CLI's
`AzdoThread` type simply did not model these sub-fields; they were silently
discarded by the JSON deserializer.

**Rationale**: The ADO response object is parsed by native `fetch` → `response.json()`
with no schema validation. Any field present in the JSON is available as long
as the TypeScript interface declares it. Expanding `AzdoThread.threadContext`
to include the position sub-objects is sufficient.

**Alternatives considered**:
- A separate `GET .../threads/{threadId}` per thread: unnecessary overhead,
  same data already in the list response.

---

## Decision 4 — JSON output shape

**Decision**: Add `line: number | null` as a top-level field on each thread
object in the `--json` output. Do NOT change `threadContext` from `string`
to an object.

**Rationale**: Changing `threadContext` from a string to an object would be a
breaking change for existing `--json` consumers. Adding a new sibling field
is additive and backward-compatible, consistent with how `codeCommentCounts`
was added in feature `023-pr-comments-status`.

---

## Decision 5 — Test fixture strategy

**Decision**: Update all existing `ActiveCommentThread` fixtures to include
`line: null`. Add new test cases in `pr-client.test.ts` for the four
line-extraction scenarios.

**Rationale**: TypeScript strict mode will require `line` on every
`ActiveCommentThread` literal once the interface gains the field. Updating
fixtures is mandatory. New test cases verify the mapping logic directly
without needing end-to-end tests.
