# Implementation Plan: Fix `azdo pr status` Build/Pipeline Check Retrieval

**Branch**: `026-fix-pr-build-status` | **Date**: 2026-06-09 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/026-fix-pr-build-status/spec.md`

## Summary

`azdo pr status` displays "Checks: unable to retrieve" for PRs that have pipeline runs because (a) the policy evaluations API fails silently for some configurations, and (b) pipeline runs on the PR merge ref (`refs/pull/{prId}/merge`) are never queried. The fix adds the Azure DevOps Builds API as a third check source, exposes `isBlocking` from policy evaluations, and adds deduplication so a build linked by both a policy evaluation and the builds API only appears once.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: commander.js, native `fetch`, vitest
**Storage**: N/A
**Testing**: vitest (`npm test` for unit, `npm run test:integration` for integration)
**Target Platform**: Node.js LTS (CLI tool)
**Project Type**: CLI
**Performance Goals**: No regression on command latency (one additional parallel API call)
**Constraints**: No new runtime dependencies; backward-compatible output format
**Scale/Scope**: PR-level operation; single PR at a time; `$top=50` bounds build API responses

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked post-design.*

| Principle | Status | Notes |
|---|---|---|
| I. CLI-First Design | ✅ | `pr status` command unchanged; `--json` output extended additively |
| II. TypeScript Strictness | ✅ | New fields are optional with explicit types; no `any` |
| III. Single Responsibility | ✅ | New `getPullRequestBuilds` function is isolated in `pr-client.ts` |
| IV. npm Distribution | ✅ | No new runtime dependencies |
| V. Simplicity | ✅ | Minimal changes; no new abstraction layers |
| VI. ADO API Research | ✅ | MCP research confirmed endpoint URL, parameters, and response shape |

**Post-design re-check**: All principles pass. The deduplication logic is minimal (a `Set` lookup). The `isBlocking` field on `PullRequestCheck` is optional — downstream JSON consumers that don't read it are unaffected.

## Project Structure

### Documentation (this feature)

```text
specs/026-fix-pr-build-status/
├── plan.md              # This file
├── research.md          # Phase 0 — ADO API research and decisions
├── data-model.md        # Phase 1 — type changes and function contracts
├── quickstart.md        # Phase 1 — manual test guide
├── contracts/
│   ├── cli-commands.md  # Updated CLI contract
│   └── api-calls.md     # New and changed API calls
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (from /speckit.tasks)
```

### Source Code (affected files only)

```text
src/
├── types/
│   ├── pull-request.ts     # PullRequestCheck.isBlocking, source extended, AzdoPolicyEvaluation.context added
│   └── pipeline.ts         # AzdoBuild.definition.name added
└── services/
    └── pr-client.ts        # getPullRequestBuilds() added; mapPolicyEvaluationCheck isBlocking; dedup

src/commands/
└── pr.ts                   # buildPullRequestStatusEntry 3rd source; formatPullRequestChecks [optional] tag

tests/integration/
├── helpers/
│   └── integration-utils.ts  # AZDO_PR_ID_WITH_BUILDS env var
└── pull-requests.test.ts     # getPullRequestBuilds integration test suite
```

## Complexity Tracking

No constitution violations. No complexity table needed.
