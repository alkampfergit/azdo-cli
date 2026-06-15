# Implementation Plan: PR Comment Reply

**Branch**: `029-pr-comment-reply` | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/029-pr-comment-reply/spec.md`

## Summary

Add `azdo pr comments reply <threadId> "<text>"` (canonical) and `azdo pr comment-reply <threadId> "<text>"` (alias) commands to post a new comment to an existing Azure DevOps PR thread, using `POST /pullRequests/{prId}/threads/{threadId}/comments?api-version=7.1`. Follows the same structural pattern as `comment-resolve` / `comment-reopen`: a shared resolver (`resolveThreadTarget`) + a dedicated service function + two commander.js command factories.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)  
**Primary Dependencies**: commander.js (CLI), native `fetch` (HTTP)  
**Storage**: N/A  
**Testing**: vitest  
**Target Platform**: Node.js LTS  
**Project Type**: CLI  
**Performance Goals**: Single API round-trip; same response-time envelope as other PR sub-commands  
**Constraints**: No new runtime dependencies; strict TypeScript; must pass ESLint + tsup build  
**Scale/Scope**: Single command, no state, no caching

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. CLI-First | ✅ Pass | commander.js command; stdout success, stderr errors; `--json` flag; meaningful exit codes |
| II. TypeScript Strict | ✅ Pass | New interfaces typed explicitly; no `any`; `unknown` + type guard on API response |
| III. Single Responsibility | ✅ Pass | Command posts one comment to one thread; shared `resolveThreadTarget` handles PR resolution (reuse) |
| IV. npm Distribution | ✅ Pass | No new deps; tsup build unaffected |
| V. Simplicity | ✅ Pass | One new service function, two command factories (one shared body), one new type |
| VI. ADO API Research | ✅ Pass | `POST /threads/{threadId}/comments` confirmed via Microsoft Learn MCP (api-version 7.1) |

## Project Structure

### Documentation (this feature)

```text
specs/029-pr-comment-reply/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── contracts/           ← Phase 1 output
│   ├── cli-commands.md
│   └── api-calls.md
└── tasks.md             ← Phase 2 output (speckit-tasks)
```

### Source Code (affected files only)

```text
src/
├── types/
│   └── pull-request.ts   ← add PostedPrComment interface
├── services/
│   └── pr-client.ts      ← add postThreadComment()
└── commands/
    └── pr.ts             ← add runCommentReply(), createPrCommentsReplyCommand(),
                             createPrCommentReplyCommand(), register both in createPrCommand()

tests/
└── unit/
    └── pr-client.test.ts  ← add postThreadComment() unit tests (mock fetch)
```
