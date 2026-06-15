# PR Report: PR Comment Reply

**Branch**: `029-pr-comment-reply`
**Date**: 2026-06-15
**Spec**: [specs/029-pr-comment-reply/spec.md](../029-pr-comment-reply/spec.md)

## Summary

Adds `azdo pr comments reply <threadId> "<text>"` (and the flat alias `azdo pr comment-reply`) to post a new text comment into an existing pull request thread via the ADO REST API. Fills the read/write gap in the PR comments surface: the CLI could already list threads but had no way to respond to reviewer feedback programmatically.

## What's New

- **`src/types/pull-request.ts`**: Two new interfaces — `AzdoCreatedComment` (raw ADO POST /comments response shape) and `PostedPrComment` (mapped result exposed to command code).
- **`src/services/pr-client.ts`**: New `postThreadComment()` service function — builds the URL, POSTs `{ content, parentCommentId: 0, commentType: 1 }`, maps the 200 response to `PostedPrComment`.
- **`src/commands/pr.ts`**: `runCommentReply()` action (validates inputs, verifies thread exists, calls service, prints result); `createPrCommentsReplyCommand()` registered under `azdo pr comments reply`; `createPrCommentReplyCommand()` alias registered at `azdo pr comment-reply`.
- **`tests/unit/pr-client.test.ts`**: Unit tests for `postThreadComment()` covering success, 401, 403, 404, and network-error paths.

## Breaking Changes

None — `comments reply` and `comment-reply` are purely additive subcommands.

## Testing

- **Unit**: `postThreadComment()` tested with mocked `fetch` across all error paths.
- **Manual**: `azdo pr comments reply <threadId> "text"` and `--json` variant validated against a real ADO PR; `azdo pr comment-reply` alias produces identical output.

## Notes

- `parentCommentId: 0` adds a top-level comment to the thread (not nested); this matches "reply to thread" semantics per the ADO API contract.
- PR state is not pre-validated client-side — the server decides (consistent with clarification Q2 default applied during spec phase).
