# Implementation Plan: `azdo pr update` and `--description-file` on `pr open`

**Branch**: `feature/038-pr-update` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)
**Input**: `specs/038-pr-update/spec.md`, GitHub issue #96

## Summary

Add one service call (`updatePullRequest`, a `PATCH` sending only the supplied
fields), one command (`azdo pr update`, alias `azdo pr edit`), and one flag
(`--description-file` on `pr open`). Everything else is reuse: the target
resolver (`resolvePullRequestTarget`), the body reader (`resolveCommentBody`,
extended with `-` = stdin), the 4000-character constant, the error handler and
the exit-code contract.

## Technical Context

**Language/Version**: TypeScript 5.x (`strict: true`) on Node.js LTS (18+)
**Primary Dependencies**: commander.js, native `fetch` — **no new dependencies**
**Storage**: N/A (Azure DevOps REST only)
**Testing**: vitest (`tests/unit`, `tests/integration`)
**Target Platform**: Node CLI (Windows / macOS / Linux)
**Performance**: one GET (already issued for target resolution) + at most one PATCH

## Constitution Check

| Principle | Compliance |
| --- | --- |
| I. CLI-First | New commander subcommand with `--json`, meaningful exit codes (1 / 3 / 4). |
| II. TypeScript Strictness | New types in `src/types/pull-request.ts`; no `any`. |
| III. Single Responsibility | `pr update` mutates title/description only; status changes stay with #97. Shared logic lives in `pr-client.ts` / the existing helpers. |
| IV. npm Distribution | No new dependency, no build change. |
| V. Simplicity | Partial PATCH, no read-modify-write merge, no new reader abstraction. |
| VI. ADO API Research | [research.md](./research.md) — verified against Microsoft Learn MCP. |

No violations; no complexity-tracking entries.

## Design

### Transport — `src/services/pr-client.ts`

```ts
export async function updatePullRequest(
  context: AzdoContext,
  repo: string,
  cred: AuthCredential,
  prId: number,
  fields: PullRequestUpdateRequest,   // { title?: string; description?: string }
): Promise<BranchPullRequestMatch>
```

- `PATCH .../pullrequests/{prId}?api-version=7.1`, `Content-Type: application/json`.
- Body carries **only** the keys present in `fields` — never a round-tripped
  `GitPullRequest` (research.md §1).
- Throws `DESCRIPTION_TOO_LONG: …` before the request when
  `fields.description.length > MAX_PR_DESCRIPTION_CHARS`, so the client-side cap
  is enforced on the one code path that is shared by every caller.
- Maps the `200 OK` body through the existing `mapPullRequest`.

### Types — `src/types/pull-request.ts`

```ts
export interface PullRequestUpdateRequest { title?: string; description?: string }
export interface PullRequestUpdateResult {
  pullRequestId: number;
  title: string;
  description: string | null;
  url: string | null;
  noop: boolean;
  updatedFields: ('title' | 'description')[];
}
```

### Command — `src/commands/pr.ts`

`createPrUpdateCommand()`:

1. `withCommonPrOptions` + `--pr-number`, `--title`, `--title-file`,
   `--description`, `--description-file`, `--json`.
2. Resolve the two values through `resolveOptionalTextInput(inline, file, label)`
   — a thin wrapper over `resolveCommentBody` that returns `undefined` when
   neither source is given and `null` when the input was rejected (error already
   on stderr). Reject `-` used twice before touching stdin.
3. Neither supplied → `writeError('pr update requires at least one of --title, --title-file, --description or --description-file.')`.
4. `resolvePullRequestTarget(options)` — gives the PR (with current `title` /
   `description`) plus context/repo/credential, and owns the `--pr-number`
   validation, the not-found (exit 3) message and the branch C-2/C-3 contract.
5. Compare requested vs current; build `updatedFields`. Empty → emit the no-op
   result and return **without** a PATCH.
6. Otherwise `updatePullRequest(...)` with only the changed fields, and report.
7. `catch` → `handlePrCommandError(err, context, 'write')`, with
   `DESCRIPTION_TOO_LONG:` peeled off first as a validation failure (exit 1),
   exactly as `handlePrOpenError` does.

Registered on the `pr` tree as `update` with `.alias('edit')` (issue #96 names
both). No top-level alias — `pr update` is not nested, so the commander
option-plumbing hazard that forced `comment-add` / `comment-edit` does not
apply; `mergedPrOptions` is still used for consistency.

`pr open` gains `--description-file <path>`, resolved through the same helper
and mutually exclusive with `--description`. Everything downstream is unchanged:
the resolved text still flows into `openPullRequest`, still gets composed with
the repository template, still gets the composed-length pre-flight.

### Shared reader — `resolveCommentBody`

One added branch: `file === '-'` reads `readFileSync(0, 'utf-8')` instead of
`readFileSync(path)`, and reports `Cannot read standard input.` on failure. All
existing callers (`comments add|edit|reply`) inherit working stdin support.

## Testing strategy

| Suite | Covers |
| --- | --- |
| `tests/unit/pr-update.test.ts` (new) | flag validation, mutual exclusion, no-op, partial patch, stdin, exit codes |
| `tests/unit/pr-open.test.ts` | `--description-file`, `-`, mutual exclusion with `--description` |
| `tests/unit/pr-client.test.ts` | `updatePullRequest` payload shape, URL, over-length rejection |
| `tests/unit/pr-command-tree.test.ts` | `azdo pr update` driven through the real tree (option plumbing) |

Gate: `npm test && npm run lint`.

## Docs

`docs/commands.md` — the pull request section: cheat-sheet lines, an
`azdo pr update` block (flags, literal-replacement rule, no-op, JSON shape),
and the `--description-file` note under `azdo pr open`. `README.md` is not
touched: no install, quick-start, command-group or dev-setup change.
