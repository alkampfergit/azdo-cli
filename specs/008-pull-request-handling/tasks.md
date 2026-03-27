# Tasks: Pull Request Handling

**Input**: Design documents from `/specs/008-pull-request-handling/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependencies)
- **[Story]**: Which user story this task belongs to ([US1], [US2], [US3])
- Exact file paths are included in every task description

---

## Phase 1: Setup (Shared Types)

**Purpose**: Create the new type definitions that all subsequent phases depend on.

- [ ] T001 Create `src/types/pull-request.ts` with all exported TypeScript interfaces: `BranchPullRequestMatch`, `PullRequestStatusResult`, `PullRequestOpenRequest`, `PullRequestOpenResult`, `ActiveCommentThread`, `ActivePullRequestComment`, `PullRequestCommentsResult`, and internal AzDo API response interfaces (`AzdoPrListResponse`, `AzdoPullRequest`, `AzdoThreadListResponse`, `AzdoThread`, `AzdoComment`) — shapes defined in `specs/008-pull-request-handling/data-model.md`

**Checkpoint**: Type file in place — all other phases can reference it

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Git helpers and PR API service — MUST be complete before any command subcommand can be implemented.

**⚠️ CRITICAL**: No user story command work can begin until this phase is complete.

- [ ] T002 Extend `src/services/git-remote.ts` — add exported pure function `parseRepoName(url: string): string | null` that reuses the existing URL regex patterns (same four patterns as `parseAzdoRemote`) and returns the repository name segment (the path segment after `_git/` for HTTPS, or the third `/`-separated segment for SSH), returning `null` when no pattern matches
- [ ] T003 Extend `src/services/git-remote.ts` — add exported function `detectRepoName(): string` that calls `execSync('git remote get-url origin')` then `parseRepoName()`, throwing an actionable `Error` if the remote cannot be resolved or the URL is not an Azure DevOps remote (mirror the existing `detectAzdoContext()` error-throwing pattern)
- [ ] T004 Extend `src/services/git-remote.ts` — add exported function `getCurrentBranch(): string` that calls `execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' })`, trims the result, and throws `Error('Not on a named branch. Check out a named branch and try again.')` if the result is `'HEAD'` (detached HEAD)
- [ ] T005 Create `src/services/pr-client.ts` — implement and export `listPullRequests(context: AzdoContext, repo: string, pat: string, sourceBranch: string, opts?: { status?: string; targetBranch?: string }): Promise<BranchPullRequestMatch[]>` that calls `GET /git/repositories/{repo}/pullrequests` with `searchCriteria.sourceRefName=refs/heads/{sourceBranch}` (plus optional status and targetRefName filters), maps the `AzdoPrListResponse` to `BranchPullRequestMatch[]`, and uses the existing `fetchWithErrors` / auth-header pattern from `src/services/azdo-client.ts`
- [ ] T006 Add `openPullRequest(context: AzdoContext, repo: string, pat: string, sourceBranch: string, title: string, description: string): Promise<PullRequestOpenResult>` to `src/services/pr-client.ts` — first calls `listPullRequests` with `status: 'active'` and `targetBranch: 'develop'`; if zero matches POST-creates a new PR (201 response maps to `{ created: true, pullRequest: ... }`); if exactly one match returns `{ created: false, pullRequest: ... }`; if multiple matches throws `Error('AMBIGUOUS_PRS:<ids>')` where ids is a comma-separated list of PR IDs
- [ ] T007 Add `getPullRequestThreads(context: AzdoContext, repo: string, pat: string, prId: number): Promise<ActiveCommentThread[]>` to `src/services/pr-client.ts` — calls `GET /git/repositories/{repo}/pullRequests/{prId}/threads`, filters to threads where `status === 'active' || status === 'pending'`, within each thread excludes comments where `isDeleted === true` or `content` is empty/whitespace, excludes threads that have zero visible comments after filtering, maps `threadContext?.filePath` to `threadContext` string (or `null` for general comments)
- [ ] T008 [P] Create `tests/unit/pr-git-helpers.test.ts` — unit tests using vitest for `parseRepoName` (HTTPS modern URL extracts repo name, HTTPS legacy, SSH modern, SSH legacy, non-AzDo URL returns null, empty string returns null) and for `getCurrentBranch` (mock execSync returning normal branch name succeeds, mock returning `'HEAD'` throws detached-HEAD error) and for `detectRepoName` (mock execSync returning valid remote succeeds, mock throwing throws actionable error)
- [ ] T009 [P] Create `tests/unit/pr-client.test.ts` — unit tests using vitest mocking `fetch` for: `listPullRequests` (success returns mapped array, empty response returns empty array, auth failure throws), `openPullRequest` (zero active PRs → creates and returns `created: true`, one active PR → returns `created: false`, two active PRs → throws AMBIGUOUS_PRS error), `getPullRequestThreads` (returns only active/pending threads, excludes closed threads, excludes `isDeleted` comments, excludes threads with all comments deleted)

**Checkpoint**: Foundation ready — git helpers tested, PR service tested, all three user story phases can begin

---

## Phase 3: User Story 1 — Check Pull Requests for Current Branch (Priority: P1) 🎯 MVP

**Goal**: `azdo pr status` shows all pull requests for the current branch, or a clear no-results message.

**Independent Test**: Run `azdo pr status` on a branch with no PRs (gets no-results message, exit 0). Run on a branch with one active and one completed PR (both listed with status, exit 0). Run `azdo pr status --json` and verify JSON shape matches `PullRequestStatusResult`.

- [ ] T010 [US1] Create `src/commands/pr.ts` — implement `createPrStatusCommand(): Command` that (1) declares `pr status` with `--org`, `--project`, `--json` options, (2) in its action resolves context via `resolveContext()`, resolves repo via `detectRepoName()`, resolves branch via `getCurrentBranch()`, resolves PAT via `resolvePat()`, (3) calls `listPullRequests()` with no status filter so all states are returned, (4) on success with zero matches writes `No pull requests found for branch {branch}.` to stdout (exit 0), (5) on success with matches writes one block per PR with ID, status, title, source→target, and URL to stdout, (6) with `--json` writes `PullRequestStatusResult` JSON to stdout, (7) on error writes actionable message to stderr and exits 1 — follow the action/error pattern from `src/commands/get-item.ts`
- [ ] T011 [US1] Add `createPrCommand(): Command` to `src/commands/pr.ts` that creates a `Command('pr')` with description `'Manage Azure DevOps pull requests'`, calls `pr.addCommand(createPrStatusCommand())`, and returns the command; then add `import { createPrCommand } from './commands/pr.js'` and `program.addCommand(createPrCommand())` to `src/index.ts`
- [ ] T012 [P] [US1] Create `tests/unit/pr-status.test.ts` — unit tests using vitest with mocked `listPullRequests`, `detectRepoName`, `getCurrentBranch`, `resolvePat`, `resolveContext`: (1) no PRs → stdout contains no-results message, exit 0; (2) one active PR → stdout contains PR id, status, and URL; (3) multiple PRs → each listed; (4) `--json` → stdout parses as valid `PullRequestStatusResult`; (5) AUTH_FAILED → stderr actionable message, exit 1; (6) detached HEAD → stderr actionable message, exit 1

**Checkpoint**: `pr status` works end-to-end. User Story 1 is independently testable.

---

## Phase 4: User Story 2 — Open a Pull Request Against Develop (Priority: P2)

**Goal**: `azdo pr open --title "x" --description "y"` creates a PR to `develop` or reuses the existing active one.

**Independent Test**: Run `azdo pr open --title "T" --description "D"` from a branch with no active PR to `develop` (new PR created, output shows PR id and URL, exit 0). Run again (existing PR returned, output says already exists, exit 0). Run `azdo pr open` without flags (exits 1 with missing-flag error). Run from `develop` branch (exits 1 with actionable error).

- [ ] T013 [US2] Add `createPrOpenCommand(): Command` to `src/commands/pr.ts` that (1) declares `pr open` with required `--title <title>`, required `--description <description>`, plus `--org`, `--project`, `--json` options, (2) validates that both `--title` and `--description` are present and non-empty, writing `Error: --title is required for pull request creation.` or `Error: --description is required for pull request creation.` to stderr and exiting 1 if missing, (3) rejects source branch `develop` with `Error: Pull request creation requires a source branch other than develop.`, (4) calls `openPullRequest()`, (5) on `created: true` writes `Created pull request #{id}: {title}\n{url}` to stdout, (6) on `created: false` writes `Active pull request already exists for {branch} -> develop: #{id}\n{url}` to stdout, (7) on AMBIGUOUS_PRS error writes actionable ambiguity message to stderr and exits 1, (8) supports `--json` output as `PullRequestOpenResult`; register the subcommand in `createPrCommand()` with `pr.addCommand(createPrOpenCommand())`
- [ ] T014 [P] [US2] Create `tests/unit/pr-open.test.ts` — unit tests: (1) missing `--title` → stderr contains required-flag message, exit 1; (2) missing `--description` → stderr contains required-flag message, exit 1; (3) source branch `develop` → stderr contains source-branch error, exit 1; (4) `openPullRequest` returns `created: true` → stdout contains "Created pull request", exit 0; (5) `openPullRequest` returns `created: false` → stdout contains "already exists", exit 0; (6) `openPullRequest` throws AMBIGUOUS_PRS → stderr contains ambiguity message, exit 1; (7) `--json` with created result → stdout parses as `PullRequestOpenResult` with `created: true`

**Checkpoint**: `pr open` is idempotent and fully guarded. User Story 2 independently testable.

---

## Phase 5: User Story 3 — Retrieve Active Pull Request Comments (Priority: P2)

**Goal**: `azdo pr comments` lists active discussion threads for the current branch's single active PR, grouped by thread.

**Independent Test**: Run `azdo pr comments` on a branch with one active PR that has two active threads and one closed thread (only the two active threads displayed, each with header and indented comments, exit 0). Run on a branch with one active PR and no active comments (empty-result message, exit 0). Run on a branch with no active PR (exits 1 with actionable error). Run on a branch with two active PRs (exits 1 with ambiguity error listing both PR IDs).

- [ ] T015 [US3] Add `createPrCommentsCommand(): Command` to `src/commands/pr.ts` that (1) declares `pr comments` with `--org`, `--project`, `--json` options, (2) calls `listPullRequests()` filtered to `status: 'active'`, (3) zero active PRs → stderr `Error: No active pull request found for branch {branch}.`, exit 1, (4) multiple active PRs → stderr `Error: Multiple active pull requests found for branch {branch}: #{id1}, #{id2}. Use pr status to review them.`, exit 1, (5) one active PR → calls `getPullRequestThreads()`, (6) zero threads → stdout `Pull request #{id} has no active comments.`, exit 0, (7) threads present → stdout block: `Active comments for pull request #{id}: {title}`, then for each thread `\nThread #{id} [{status}] {context|'(general)'}` followed by each comment indented two spaces as `  {author}: {content}`, (8) supports `--json` output as `PullRequestCommentsResult`; register in `createPrCommand()` with `pr.addCommand(createPrCommentsCommand())`
- [ ] T016 [P] [US3] Create `tests/unit/pr-comments.test.ts` — unit tests: (1) no active PR → stderr contains no-active-PR message, exit 1; (2) two active PRs → stderr contains ambiguity message with both IDs, exit 1; (3) one active PR, zero threads → stdout contains no-active-comments message, exit 0; (4) one active PR with two active threads → stdout contains thread headers and indented comments; (5) closed thread excluded from output; (6) deleted comment excluded, thread still shown if other comments remain; (7) thread with all comments deleted excluded entirely; (8) `--json` → stdout parses as `PullRequestCommentsResult`

**Checkpoint**: All three user stories complete and independently testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the full implementation and update documentation.

- [ ] T017 Run `npm test && npm run lint` from the repository root; fix any TypeScript strict-mode type errors, ESLint violations, or failing test cases found across `src/types/pull-request.ts`, `src/services/git-remote.ts`, `src/services/pr-client.ts`, `src/commands/pr.ts`, `src/index.ts`, and all new test files
- [ ] T018 Update `README.md` to add a `pr` command section documenting `azdo pr status`, `azdo pr open --title <title> --description <description>`, and `azdo pr comments` with usage examples, option tables, and output descriptions — content sourced from `specs/008-pull-request-handling/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on T001 — BLOCKS all user story phases
- **User Story Phases (3–5)**: All depend on Phase 2 completion; can proceed sequentially in priority order (P1 → P2) or in parallel if staffed
- **Polish (Phase 6)**: Depends on all desired user story phases being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2; no dependency on US2 or US3
- **US2 (P2)**: Can start after Phase 2; no dependency on US1 or US3
- **US3 (P2)**: Can start after Phase 2; no dependency on US1 or US2

All three subcommands live in `src/commands/pr.ts`. Implement each subcommand function and register it in `createPrCommand()` within its own story phase to avoid file conflicts when working sequentially.

### Within Each Story Phase

- Implementation task first (T010/T013/T015) — establishes the interface
- Test task after (T012/T014/T016) — validates the implementation

---

## Parallel Opportunities

### Phase 2 Parallel Groups (after T001)

```
# Git helpers (same file — sequential):
T002 → T003 → T004

# PR client (same file — sequential):
T005 → T006 → T007

# Tests (different files — parallel after T002–T007):
Task: T008 "tests/unit/pr-git-helpers.test.ts"
Task: T009 "tests/unit/pr-client.test.ts"
```

### User Story Cross-Phase Parallel (if multiple developers)

```
# After Phase 2 completes:
Developer A: T010 → T011 → T012  (US1 pr status)
Developer B: T013 → T014          (US2 pr open)   ← wait for T011 to register parent command
Developer C: T015 → T016          (US3 pr comments) ← wait for T011
```

Note: Since all subcommands are added to the same `pr.ts` file, sequential story implementation (US1 → US2 → US3) is the safest approach for single-developer work.

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Complete Phase 1 (T001)
2. Complete Phase 2 (T002–T009)
3. Complete Phase 3 (T010–T012)
4. **STOP and VALIDATE**: Run `npm test`, test `azdo pr status` manually
5. Demo/ship `pr status` as a standalone increment

### Incremental Delivery

1. T001–T009 → Shared foundation verified
2. T010–T012 → `pr status` tested → ship MVP
3. T013–T014 → `pr open` tested → ship
4. T015–T016 → `pr comments` tested → ship
5. T017–T018 → Clean up and document

---

## Task Summary

| Phase | Tasks | Parallelizable | User Story |
|-------|-------|---------------|------------|
| Phase 1: Setup | T001 | — | — |
| Phase 2: Foundational | T002–T009 | T008, T009 | — |
| Phase 3: US1 pr status | T010–T012 | T012 | US1 |
| Phase 4: US2 pr open | T013–T014 | T014 | US2 |
| Phase 5: US3 pr comments | T015–T016 | T016 | US3 |
| Phase 6: Polish | T017–T018 | — | — |
| **Total** | **18 tasks** | **4 parallelizable** | |
