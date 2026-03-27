# Implementation Plan: Pull Request Handling

**Branch**: `008-pull-request-handling` | **Date**: 2026-03-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/008-pull-request-handling/spec.md`

## Summary

Add a `pr` command group to the `azdo` CLI with three subcommands — `pr status`, `pr open`, and `pr comments` — that let users check whether the current branch has pull requests, open a new pull request to `develop` (idempotent), and retrieve active discussion threads for the current branch's pull request. All three commands resolve the branch, repository, org, and project automatically from local git state and existing config. `pr open` requires explicit `--title` and `--description` flags. Comment output is grouped by thread. The implementation extends `git-remote.ts` with repo-name and branch-name helpers, adds a new `pr-client.ts` service for the Azure DevOps Git REST API, and adds a new `pr.ts` command file.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js LTS (18+)
**Primary Dependencies**: commander.js (CLI), native `fetch` (HTTP), `node:child_process` execSync (git commands) — all existing
**Storage**: N/A (reads and writes to Azure DevOps API only)
**Testing**: vitest (existing)
**Target Platform**: Node.js LTS, cross-platform
**Project Type**: CLI tool
**Performance Goals**: No specific latency targets; interactive CLI use
**Constraints**: No new runtime dependencies. Minimum required PAT scope: `Code (Read)` for status/comments, `Code (Read & Write)` for open.
**Scale/Scope**: Three new command handlers, one new service module, one new types file, extensions to two existing files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Notes |
|-----------|-------|-------|
| I. CLI-First Design | PASS | Three subcommands under `pr` group; `--json` on all; errors to stderr; meaningful exit codes |
| II. TypeScript Strictness | PASS | All new code uses strict types; no `any`; internal AzDo response interfaces use type guards |
| III. Single Responsibility Commands | PASS | `pr status` reads only; `pr open` creates only; `pr comments` reads threads only |
| IV. npm Distribution | PASS | No new runtime dependencies added |
| V. Simplicity | PASS | Minimal new files; extends existing services rather than new abstractions |

No violations. Complexity Tracking table not needed.

## Project Structure

### Documentation (this feature)

```text
specs/008-pull-request-handling/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── cli-contract.md
│   └── pull-request-commands.md
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code

```text
src/
├── commands/
│   └── pr.ts                  # NEW — parent pr command + status/open/comments subcommands
├── services/
│   ├── git-remote.ts          # EXTEND — add parseRepoName(), detectRepoName(), getCurrentBranch()
│   └── pr-client.ts           # NEW — listPullRequests(), openPullRequest(), getPullRequestThreads()
├── types/
│   └── pull-request.ts        # NEW — all PR-related TypeScript interfaces
└── index.ts                   # EXTEND — register createPrCommand()

tests/unit/
├── pr-git-helpers.test.ts     # NEW — parseRepoName, detectRepoName, getCurrentBranch
├── pr-client.test.ts          # NEW — listPullRequests, openPullRequest, getPullRequestThreads
├── pr-status.test.ts          # NEW — pr status subcommand
├── pr-open.test.ts            # NEW — pr open subcommand (creation, reuse, guards)
└── pr-comments.test.ts        # NEW — pr comments subcommand (filtering, ambiguity)
```

**Structure Decision**: Single project, flat command layout. New files follow existing naming and location conventions. No subdirectories added.

## Phase 0: Research

All unknowns resolved. See [research.md](research.md).

Key decisions:
- **R1**: Command names `pr status`, `pr open`, `pr comments` (clarified 2026-03-27)
- **R2**: `git rev-parse --abbrev-ref HEAD` for branch; new `parseRepoName()`/`detectRepoName()` in `git-remote.ts`
- **R3**: Azure DevOps Git REST API v7.1 via existing `fetch`-based pattern
- **R4**: Duplicate check before `pr open` — query active PRs for source+target match
- **R5**: Active threads = `status === 'active'` or `status === 'pending'`; exclude `isDeleted` comments
- **R6**: Empty results are success for `status` and `comments`; ambiguity is a hard fail
- **R7**: `pr open` requires `--title` and `--description` as named flags (clarified 2026-03-27)
- **R8**: Branch reference format `refs/heads/{name}` formatted internally in `pr-client.ts`

## Phase 1: Design & Contracts

See [data-model.md](data-model.md) and [contracts/](contracts/).

### git-remote.ts Extensions

Two new pure functions and one effectful function following the exact pattern of `parseAzdoRemote()` / `detectAzdoContext()`:

```typescript
// Pure — extract repo name from remote URL string
export function parseRepoName(remoteUrl: string): string | null

// Effectful — run git + call parseRepoName; throws with actionable message on failure
export function detectRepoName(): string

// Effectful — run git rev-parse --abbrev-ref HEAD; throws on detached HEAD
export function getCurrentBranch(): string
```

The existing regex patterns in `parseAzdoRemote` cover HTTPS modern, HTTPS legacy, SSH modern, and SSH legacy. The same patterns are reused in `parseRepoName` with the repo segment as capture group 3.

### pr-client.ts Service

Three exported async functions:

```typescript
export async function listPullRequests(
  context: AzdoContext,
  repo: string,
  pat: string,
  sourceBranch: string,
  opts?: { status?: string; targetBranch?: string }
): Promise<BranchPullRequestMatch[]>

export async function openPullRequest(
  context: AzdoContext,
  repo: string,
  pat: string,
  sourceBranch: string,
  title: string,
  description: string
): Promise<PullRequestOpenResult>

export async function getPullRequestThreads(
  context: AzdoContext,
  repo: string,
  pat: string,
  prId: number
): Promise<ActiveCommentThread[]>
```

`openPullRequest` contains the duplicate-check logic internally: query active PRs → zero/one/many branching → create or return.

`getPullRequestThreads` filters threads and comments before returning.

### pr.ts Command

```typescript
export function createPrCommand(): Command {
  const pr = new Command('pr').description('Manage Azure DevOps pull requests');
  pr.addCommand(createPrStatusCommand());
  pr.addCommand(createPrOpenCommand());
  pr.addCommand(createPrCommentsCommand());
  return pr;
}
```

Each subcommand follows the same action pattern as existing commands: resolve context → resolve pat → call service → format output → write to stdout.

`createPrOpenCommand()` validates `--title` and `--description` presence before any API calls and exits with exit code 1 if missing.

### index.ts Registration

Add one line:
```typescript
import { createPrCommand } from './commands/pr.js';
// ...
program.addCommand(createPrCommand());
```

## Implementation Order

1. `src/types/pull-request.ts` — define all interfaces (no dependencies)
2. `src/services/git-remote.ts` — add `parseRepoName`, `detectRepoName`, `getCurrentBranch`
3. `src/services/pr-client.ts` — implement service functions using new types
4. `src/commands/pr.ts` — implement all three subcommands
5. `src/index.ts` — register `createPrCommand()`
6. Tests for git helpers, pr-client, and each subcommand

## Test Strategy

- **Unit tests only** — mock `fetch`, `execSync`, and `resolvePat` with vitest.
- `pr-git-helpers.test.ts`: regex parsing for all URL patterns; detached HEAD guard; missing remote guard.
- `pr-client.test.ts`: list returns correctly mapped results; open duplicate path; open create path; open ambiguity path; thread filtering excludes closed and deleted; empty thread list is success.
- `pr-status.test.ts`: no PRs → zero-result output; PRs found → formatted list; `--json` output shape.
- `pr-open.test.ts`: missing `--title` → error; missing `--description` → error; `develop` source → error; created → success output; reused → reuse output; `--json` shape.
- `pr-comments.test.ts`: no active PR → error; multiple active PRs → ambiguity error; one PR no comments → empty success; one PR with threads → grouped output; `--json` shape; closed threads excluded; deleted comments excluded.
