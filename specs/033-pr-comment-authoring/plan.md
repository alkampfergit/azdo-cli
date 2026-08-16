# Implementation Plan: PR Comment Authoring & Pull Request Lookup

**Branch**: `033-pr-comment-authoring` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/033-pr-comment-authoring/spec.md`

## Summary

Replace four ad-hoc PowerShell scripts with native `azdo pr` subcommands:
`pr comments add` (create a thread, `POST .../threads`), `pr comments edit`
(rewrite a comment, `PATCH .../threads/{t}/comments/{c}`), `pr list`
(`GET .../pullrequests` with optional source-branch / status / top criteria), plus
`--exclude-system` / `--max-chars` on `pr comments`, `--file` on `pr comments reply`, and `--repo`
across the whole `pr` group. Each new command follows the established shape: a transport function in
`src/services/pr-client.ts`, a `run*()` action in `src/commands/pr.ts` reusing the shared PR
resolver, and a commander factory registered both under `pr comments` and as a top-level alias —
exactly the layout 029 introduced for `reply` / `comment-reply`.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)  
**Primary Dependencies**: commander.js (CLI), native `fetch` (HTTP), `node:fs` for `--file` (already used by `set-md-field`)  
**Storage**: N/A  
**Testing**: vitest  
**Target Platform**: Node.js LTS  
**Project Type**: CLI  
**Performance Goals**: One API round-trip per command (`pr comments edit` uses two: read thread, then patch)  
**Constraints**: No new runtime dependencies; strict TypeScript; existing command output unchanged when new flags are absent  
**Scale/Scope**: Three new commands (+2 aliases), four new flags, one deletion of four scripts

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. CLI-First | ✅ Pass | commander.js commands; stdout success, stderr errors; `--json` everywhere; non-zero exit on failure |
| II. TypeScript Strict | ✅ Pass | New request/response interfaces typed; no `any`; status values narrowed to a union |
| III. Single Responsibility | ✅ Pass | One transport function per API call; `resolvePullRequestTarget()` extracted from `resolveThreadTarget()` and shared |
| IV. npm Distribution | ✅ Pass | No new deps; tsup build unaffected |
| V. Simplicity | ✅ Pass | Canonical + alias built from one factory each; shared body resolver for add/edit/reply |
| VI. ADO API Research | ✅ Pass | `POST /threads`, `PATCH /threads/{t}/comments/{c}`, and `searchCriteria.*` confirmed against the api-version 7.1 surface already used by this client |

## Project Structure

### Documentation (this feature)

```text
specs/033-pr-comment-authoring/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── contracts/           ← Phase 1 output
│   ├── cli-commands.md
│   └── api-calls.md
├── checklists/
│   └── requirements.md
└── tasks.md             ← Phase 2 output
```

### Source Code (affected files only)

```text
src/
├── types/
│   └── pull-request.ts   ← CreatableThreadStatus, PullRequestThreadCreateRequest;
│                            description on BranchPullRequestMatch/AzdoPullRequest;
│                            commentType on ActivePullRequestComment/AzdoComment
├── services/
│   └── pr-client.ts      ← createPullRequestThread(), updateThreadComment(),
│                            getPullRequestThread(), listRepositoryPullRequests();
│                            optional source branch + $top in buildPullRequestsUrl()
└── commands/
    └── pr.ts             ← withCommonPrOptions() (--org/--project/--repo on every subcommand),
                             resolveCommentBody(), truncateContent(), shapeThreadForOutput(),
                             resolvePullRequestTarget() split out of resolveThreadTarget(),
                             runCommentAdd(), runCommentEdit(), createPrListCommand(),
                             --file on reply, --exclude-system/--max-chars on comments

tests/unit/
├── pr-client.test.ts             ← new transport functions + description/commentType mapping
├── pr-comment-authoring.test.ts  ← new: add / edit, both aliases
├── pr-comment-reply.test.ts      ← new: reply command incl. --file (was untested at command level)
├── pr-list.test.ts               ← new: pr list
└── pr-comments-filters.test.ts   ← --exclude-system, --max-chars, --repo

scripts/                          ← add_pr_comment.ps1, update_pr_comment.ps1,
                                     get_pr_comments.ps1, find_pr_for_branch.ps1 DELETED
```

## Phasing

1. **Types** — request/response shapes, `description`, `commentType`.
2. **Transport** — four functions in `pr-client.ts`; `buildPullRequestsUrl()` generalised.
3. **Commands** — shared helpers first (`withCommonPrOptions`, `resolveCommentBody`,
   `resolvePullRequestTarget`), then `add` / `edit` / `list`, then the flag additions.
4. **Tests** — command-level suites per command, transport-level suite per API call.
5. **Docs & removal** — `docs/commands.md`, `README.md`, changelog, agent memory; delete the scripts.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Adding `description` / `commentType` to mapped objects changes `--json` output | Both are additive fields; existing keys and human-readable output are untouched. Existing test expectations updated in the same change. |
| A new flag silently missing from one subcommand | `--org` / `--project` / `--repo` are registered through a single `withCommonPrOptions()` helper. |
| Editing another author's comment fails at the server | Surfaced through the existing `PERMISSION_DENIED` mapping with the write-scope hint; documented in the contract. |
| `pr list` flooding stdout on a busy repository | `--top` defaults to 25 and is sent as `$top`. |
