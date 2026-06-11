# Implementation Plan: PR Comment Line Number Display

**Branch**: `028-pr-comment-line` | **Date**: 2026-06-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/028-pr-comment-line/spec.md`

## Summary

Add line-number display to `azdo pr comments`: each code-anchored thread header
gains a `:N` suffix in human-readable output, and the `--json` output gains a
`line: number | null` field per thread. The ADO threads endpoint already returns
`threadContext.rightFileStart` / `leftFileStart` with `{ line, offset }` — the
CLI currently discards them during mapping. The fix is purely in the type layer
and mapper, with no new API call.

## Technical Context

**Language/Version**: TypeScript 5.x (strict: true)
**Primary Dependencies**: commander.js (CLI framework), native `fetch` (HTTP), vitest (tests)
**Storage**: N/A
**Testing**: vitest — `npm test`
**Target Platform**: Node.js LTS, npm distribution
**Project Type**: CLI tool
**Performance Goals**: N/A — purely a data-mapping change, no latency impact
**Constraints**: Zero new runtime dependencies; `npm run lint && npm test && npm run build` must pass
**Scale/Scope**: Touches 2 source files, 2–3 test files; no new commands

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. CLI-First | ✅ Pass | Modifies existing `azdo pr comments` command; both human and `--json` output updated |
| II. TypeScript Strictness | ✅ Pass | New field is `number \| null` — no `any`, no type suppressions |
| III. Single Responsibility | ✅ Pass | Only `pr comments` output is touched; no other command affected |
| IV. npm Distribution | ✅ Pass | No new dependencies; bundler unchanged |
| V. Simplicity | ✅ Pass | Minimal change: expand ADO type + update mapper + update formatter |
| VI. ADO API Research | ✅ Pass | Validated against Microsoft Learn and Context7 — `rightFileStart`/`leftFileStart` confirmed in API response |

No violations. Complexity Tracking section not required.

## Project Structure

### Documentation (this feature)

```text
specs/028-pr-comment-line/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── cli-commands.md  ← Phase 1 output
└── tasks.md             ← /speckit-tasks output (not yet created)
```

### Source Code (repository root)

```text
src/
├── types/
│   └── pull-request.ts         ← expand AzdoThread.threadContext; add line to ActiveCommentThread
├── services/
│   └── pr-client.ts            ← update mapThread() and toActiveCommentThread()
└── commands/
    └── pr.ts                   ← update formatThreads() to append :N

tests/unit/
├── pr-client.test.ts           ← add line-extraction test cases; update existing fixtures
├── pr-comments.test.ts         ← update existing fixtures; add :N in output assertions
└── pr-comments-filters.test.ts ← update existing fixtures (add line: null)
```

**Structure Decision**: Single-project layout. All touched files already exist in this structure.
