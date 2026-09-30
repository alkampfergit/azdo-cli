# Implementation Plan: `azdo pr comments delete`

**Branch**: `feature/047-pr-comment-delete` | **Date**: 2026-09-30 | **Spec**: [spec.md](./spec.md)
**Input**: GitHub issue #120

## Summary

Add the missing delete verb to the `pr comments` family. One new client
function wraps the documented DELETE; one new command (nested `delete` plus the
`comment-delete` alias) reuses the thread-target resolution, the `--comment-id`
parsing and the comment lookup that `edit` already has.

## Technical Context

- TypeScript 5.x strict, commander.js, native `fetch` — unchanged.
- API researched via the Microsoft Learn MCP server (Constitution VI):
  *Pull Request Thread Comments - Delete*, api-version 7.1, response `200`
  with no body, scopes `vso.code_write` / `vso.threads_full`.
- `fetchWithErrors` already maps 401/403/404 to `AUTH_FAILED` /
  `PERMISSION_DENIED` / `NOT_FOUND` with the server detail (037), and
  `handlePrCommandError(…, 'write')` already renders them with exit 4/3.
- `mapComment` already skips `isDeleted` comments, so listings stop showing a
  deleted comment without any change.

## Constitution Check

- **I CLI-first**: commander subcommand, `--json`, meaningful exit codes. ✅
- **II Strictness**: no `any`; the client returns `Promise<void>`. ✅
- **III Single responsibility**: `delete` is its own subcommand, not a flag on
  `edit`. ✅
- **V Simplicity**: no new abstractions; two small helpers extracted from `edit`
  because `delete` needs the same two steps. ✅
- **VI API research**: Learn MCP consulted before code. ✅
- **VII README**: quick-start line only; subcommand detail lives in
  `docs/commands.md`. ✅

## Design

### Client — `src/services/pr-client.ts`

`deleteThreadComment(context, repo, cred, prId, threadId, commentId): Promise<void>`
builds the same URL as `updateThreadComment`, sends `DELETE` with only the auth
headers, throws `httpError(response)` on a non-ok status and reads nothing.

### Command — `src/commands/pr.ts`

- `parseExplicitCommentId(options)` and `findCommentInThread(thread, id, target)`
  are lifted out of `runCommentEdit` / `selectEditableComment` so both commands
  share the `Invalid --comment-id` and `Comment #N not found` paths.
  `fetchThreadForEdit` becomes `fetchTargetThread`.
- `selectDeletableComment`: explicit id → lookup; one comment → that one; none →
  exit 3; several → exit 1 listing `#id (author)` sorted by id.
- `runCommentDelete`: parse → resolve PR/thread target → fetch thread → select →
  DELETE unless `--dry-run` → report. Errors go to
  `handlePrCommandError(err, context, 'write')`.
- `buildCommentDeleteCommand(name, description)` produces both the nested
  `delete` and the top-level `comment-delete`; both registered.

### Why no client-side "completed PR" refusal

The issue lists "PR already completed" among the failure cases. Azure DevOps
accepts comment writes on completed pull requests, so a client-side refusal
would block a legitimate operation; if the server does reject, its message
reaches the operator via 037 with exit 1. The spec records this as FR-008.

## Tests

- `tests/unit/pr-comment-authoring.test.ts`: single-comment default, ambiguous
  thread refusal with candidate list, explicit `--comment-id`, invalid ids
  before network, not-found exit 3 (thread, comment, empty thread), `--dry-run`
  text and JSON, `--json` shape, branch auto-detection, 403 → exit 4 with server
  detail, server rejection surfaced, no prompt, alias parity.
- `tests/unit/pr-client.test.ts`: DELETE URL and method, no body sent, no body
  read on 204, 403/404/400 mapping.
- `tests/unit/pr-command-tree.test.ts`: nested and alias forms through the real
  `azdo pr` tree with `--pr-number`, `--comment-id`, `--repo`, `--json`.

## Docs

`docs/commands.md` cheat sheet + command block + scope note + exit-code table;
`README.md` one quick-start line; `docs/changelogs/unreleased.md` Added entry;
`AGENTS.md` Recent Changes (repository memory lives there, not in `CLAUDE.md`).
