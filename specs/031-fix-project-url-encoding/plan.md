# Implementation Plan: Fix URL Percent-Encoding for ADO Project Names with Spaces

**Branch**: `031-fix-project-url-encoding` | **Date**: 2026-06-16 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/031-fix-project-url-encoding/spec.md`

## Summary

When `detectAzdoContext()` (and `parseAzdoRemote()`) extract the project name from a git remote URL, they assign the raw regex capture group — e.g., `Course%20Examples%20Builds` — to `project` without calling `decodeURIComponent()`. Downstream URL construction then re-encodes the `%` sign, producing `%2520`. The fix is to decode the captured project segment in both extraction paths (`matchAzdoRemote` and `parseAzdoRemote`) before returning it.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js LTS  
**Primary Dependencies**: commander.js, native `fetch`, Node.js built-ins — no new dependencies  
**Storage**: N/A  
**Testing**: vitest — `npm run test:unit` for focused runs, `npm test` for full suite  
**Target Platform**: Linux / macOS / Windows (cross-platform CLI)  
**Project Type**: CLI tool  
**Performance Goals**: N/A — parsing is O(n) over a tiny string  
**Constraints**: Zero new runtime dependencies; fix must not break any of the 5 canonical URL forms in FROZEN_BASELINE  
**Scale/Scope**: Single source file (`src/services/git-remote.ts`), single test file (`tests/unit/git-remote.test.ts`)

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. CLI-First Design | ✅ Pass | Fix is internal only; no CLI surface changes |
| II. TypeScript Strictness | ✅ Pass | `decodeURIComponent` returns `string`; types unchanged |
| III. Single Responsibility | ✅ Pass | Decoding is done at the extraction layer, not scattered |
| IV. npm Distribution | ✅ Pass | No new runtime deps |
| V. Simplicity | ✅ Pass | One-line change per affected function; YAGNI |
| VI. ADO API Research | ✅ N/A | Fix is in local URL parsing; no new ADO API calls |

No violations; Complexity Tracking section not required.

## Project Structure

### Documentation (this feature)

```text
specs/031-fix-project-url-encoding/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # N/A — no entity changes
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (affected files only)

```text
src/services/git-remote.ts          # Two one-line fixes
tests/unit/git-remote.test.ts       # Update 1 existing test + add new tests
tests/unit/fixtures/git-remote.cases.ts   # No change (FROZEN_BASELINE URLs have no %XX)
```
