# Implementation Plan: Fix malformed work item ArtifactLink URI

**Branch**: `035-fix-workitem-artifact-uri` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/035-fix-workitem-artifact-uri/spec.md`

## Summary

`azdo pr work-items link` builds the Azure DevOps `ArtifactLink` relation URI by joining the
project id, repository id, and PR id with literal `/` characters. Azure DevOps' own UI never
renders relations built this way (confirmed against Microsoft Learn docs, the official
`microsoft/azure-devops-mcp` reference implementation, and a first-hand community reproduction —
see `research.md`), even though the write itself succeeds. The fix changes
`buildWorkItemArtifactUri` in `src/services/pr-client.ts` to percent-encode the project id and
repository id segments and join all three segments with the literal string `%2F`, and updates the
existing unit tests that hard-code the old (malformed) URI shape.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode) — unchanged
**Primary Dependencies**: commander.js, native `fetch` — unchanged, no new dependencies
**Storage**: N/A (no local persistence; the corrected value is only sent to the ADO REST API)
**Testing**: vitest — existing `tests/unit/pr-client.test.ts` updated in place
**Target Platform**: Node.js CLI (unchanged)
**Project Type**: CLI (single project, existing structure)
**Performance Goals**: N/A — string construction change only, no measurable performance impact
**Constraints**: Must not change the function signatures of `buildWorkItemArtifactUri`,
`linkWorkItemToPullRequest`, or `unlinkWorkItemFromPullRequest`; must not alter any other
relation type already handled by `pr-client.ts`.
**Scale/Scope**: One function body change + matching unit-test updates; no new files, no new
commands, no new CLI flags.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. CLI-First Design**: No new command surface; existing `azdo pr work-items link`/`unlink`
  keep their argument/option shape and `--json` support. PASS.
- **II. TypeScript Strictness**: Fix stays within `strict: true`; no `any`. PASS.
- **III. Single Responsibility Commands**: No command-boundary changes. PASS.
- **IV. npm Distribution**: No dependency or build-tooling changes. PASS.
- **V. Simplicity**: Fix is a one-line string-template change plus test updates — no new
  abstraction introduced. PASS.
- **VI. Azure DevOps API Research**: Consulted Microsoft Learn MCP (`microsoft_docs_search` for
  `GitPullRequest.ArtifactId`, work item link types reference) AND cross-checked against the
  official `microsoft/azure-devops-mcp` reference server's documented artifact URI format and a
  first-hand community bug report, before finalizing the fix. Findings recorded in
  `research.md`. PASS.

No violations — Complexity Tracking section omitted.

## Project Structure

### Documentation (this feature)

```text
specs/035-fix-workitem-artifact-uri/
├── plan.md              # This file
├── research.md          # Phase 0 output — ArtifactLink URI format verification
├── data-model.md         # Phase 1 output — ArtifactLink relation field notes (no new entities)
├── quickstart.md        # Phase 1 output — manual + automated verification steps
└── tasks.md             # Phase 2 output (/speckit-tasks — not created by this command)
```

No `contracts/` directory: this fix does not add or change any CLI command, flag, or external
interface — only the internal string constructed for an existing, already-documented option
(`azdo pr work-items link/unlink`). The contract of that command (arguments, JSON shape) is
unchanged; only the `url` field's *content* is corrected.

### Source Code (repository root)

```text
src/
├── services/
│   └── pr-client.ts      # buildWorkItemArtifactUri (fix), linkWorkItemToPullRequest,
│                          # unlinkWorkItemFromPullRequest (unchanged call sites)
├── commands/              # existing `pr work-items link|unlink` command wiring — unchanged
└── ...

tests/
└── unit/
    └── pr-client.test.ts  # existing describe('linkWorkItemToPullRequest / unlinkWorkItemFromPullRequest')
                            # block updated to assert the %2F-encoded artifactUri
```

**Structure Decision**: Single-project CLI structure (existing repo layout). No new directories.
All changes land in `src/services/pr-client.ts` (implementation) and
`tests/unit/pr-client.test.ts` (tests) — matching the file(s) the constitution's "single
project" default expects for a targeted bug fix.

## Complexity Tracking

*No entries — no Constitution Check violations.*
