# Phase 0 Research — 017-pr-comments-threads

Research notes backing the plan. Unknowns resolved here; no
`NEEDS CLARIFICATION` markers remain.

## 1. Root cause of the `reading 'web'` crash

**Decision**: the crash is in `src/services/pr-client.ts:58`
(`url: pullRequest._links.web.href`) inside `mapPullRequest`. The PR list
response for the current-branch PR occasionally lacks `_links.web` (or lacks
`_links` entirely) and the code unconditionally dereferences it, throwing
`TypeError: Cannot read properties of undefined (reading 'web')`.

**Rationale**: `listPullRequests` → `mapPullRequest` is the first thing
`azdo pr comments` calls after resolving the active branch
(`src/commands/pr.ts:254`). The thread-fetch path hasn't run yet at crash
time, so the bug cannot originate in thread rendering — the PR mapping is
the only place that dereferences a `web` property on the read path.

**Alternatives considered**:
- Thread/comment rendering (`formatThreads`): rejected — it accesses
  `author`, `content`, `publishedDate`, never a `web` key.
- Upstream `fetchWithErrors`: rejected — the error string on HTTP-level
  failures is different (AUTH_FAILED / NOT_FOUND) and never matches
  `reading 'web'`.

**Fix**: make `_links` optional in the `AzdoPullRequest` type and use
optional chaining in `mapPullRequest` (`pullRequest._links?.web?.href ?? null`), with `url: string | null` on the mapped type and downstream
consumers tolerating `null`.

## 2. Root cause of the libuv `async.c` assertion on Windows

**Decision**: `writeError()` in `src/commands/pr.ts:35` calls
`process.exit(1)` synchronously from inside an async action handler. On
Windows pwsh, stdout/stderr are wrapped in libuv async handles; an abrupt
`exit()` while those handles are mid-flight triggers
`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76`.

**Rationale**: the error message in #34 lists the TypeError first, then the
libuv assertion — they are two separate failures on the same path. The
TypeError propagates up; `handlePrCommandError` routes the TypeError through
`writeError` → `process.exit(1)`, and the async handle close races with the
process teardown.

**Fix**: replace `process.exit(1)` with a pattern that lets Node drain its
streams — either throw a typed error that the top-level `.action()` catch
maps to `process.exitCode = 1` and a plain `return`, or `await`
`new Promise(resolve => process.stderr.write(msg, resolve))` before
exiting. The simpler pattern — set `process.exitCode = 1` and return — is
the project's existing style in several CLI entry points and is the one
adopted here.

**Alternatives considered**:
- Keep `process.exit(1)` but add `process.stderr.write(msg, () => process.exit(1))`:
  rejected — still abrupt and harder to reason about under error paths that
  compound.
- Catch TypeError higher up and swallow: rejected — masks the underlying
  bug (which we're fixing separately in item 1).

## 3. `--pr-number <N>` resolution path

**Decision**: add a new `getPullRequestById(context, repo, pat, prId)` helper
in `pr-client.ts` that calls
`/_apis/git/repositories/{repo}/pullRequests/{prId}?api-version=7.1` and
reuses the existing `fetchWithErrors` / `readJsonResponse` plumbing. In the
command, when `--pr-number` is set, skip `getCurrentBranch` /
`listPullRequests` entirely and call `getPullRequestById` directly.

**Rationale**: the existing `listPullRequests` is branch-scoped by design;
adding a "by id" path is cleaner than polluting that helper. Also aligns
with Single-Responsibility principle (III).

**Alternatives considered**:
- Extend `listPullRequests` to optionally filter by id: rejected — "fetch
  one PR" is a different shape (single object vs. list) and has distinct
  404 semantics ("PR not found" vs. "no active PR on branch").

**Validation**: `--pr-number` rejects non-integer / non-positive input at
the command layer with a validation error (exit non-zero). 404 from the
backend maps to "PR not found" (exit non-zero, no crash).

## 4. Showing thread status + hide-resolved filter

**Decision**: `getPullRequestThreads` already fetches every thread but the
current `mapThread` drops anything whose status is not `active | pending`
(`pr-client.ts:113-115`). Lift that filter: return **all** threads with
their backend status verbatim. Add a status indicator to the formatter
(e.g. `[active]` / `[resolved]` prefix). Add a `--hide-resolved` flag on
`pr comments` that excludes threads with status `resolved` / `closed` /
`fixed` / `wontFix` (i.e. any non-active state the backend considers
settled) before rendering.

**Rationale**: matches owner's clarification — default shows everything
with a short indicator; filter flag narrows to actionable (non-resolved)
threads.

**Alternatives considered**:
- `--hide <status>` taking a list: rejected — YAGNI (principle V), the
  concrete need is hiding "resolved-ish" states.
- Coloured tag: rejected — coloured output isn't universally supported
  (Windows pwsh, CI); stick with bracketed plain-text indicators. A future
  iteration can add colour without changing contracts.

## 5. Resolve / reopen — Azure DevOps API shape

**Decision**: use
`PATCH /_apis/git/repositories/{repo}/pullRequests/{prId}/threads/{threadId}?api-version=7.1`
with body `{ "status": "fixed" }` to resolve and `{ "status": "active" }`
to reopen. Content-Type `application/json`. The response is the updated
thread; the command prints a compact confirmation of thread-id + new status.

**Rationale**: Azure DevOps REST API docs (Git / PullRequestThreads /
Update) expose thread status mutation via PATCH. `status` is an enum
(`active`, `fixed`, `wontFix`, `closed`, `pending`, `byDesign`, `unknown`).
"Resolve" maps to `fixed` (the typical resolved state); "reopen" maps
back to `active`. Other backend states (`wontFix`, `closed`, etc.) remain
out of scope for CLI-driven transitions (per spec Assumptions) — they are
visible in listings but `pr comment-resolve` / `pr comment-reopen` treat
any non-active state as "already resolved" / any active state as "already
open" for idempotency.

**Alternatives considered**:
- PUT the full thread body: rejected — PATCH is narrower, lower blast
  radius, and matches the REST API contract more directly.
- A single `pr comment-status <active|fixed>` command: rejected — the
  verbs "resolve" and "reopen" read more naturally and keep each command
  doing one thing (principle III).

**Idempotency**: before PATCH, the command reads the thread's current
status via the existing threads GET, and if the target state is already in
place, skips the PATCH, prints "thread #<id> already <state>" and exits 0.

## 6. Integration test against PR #64

**Decision**: extend `tests/integration/pull-requests.test.ts` with a
block gated on `SKIP_PR` and `AZDO_PR_ID` (existing env var, already
exported from `integration-utils.ts`). Add a read-path test that calls
`getPullRequestThreads(makeContext(), AZDO_REPO, AZDO_PAT, AZDO_PR_ID!)`
and asserts at least one thread with at least one non-deleted comment.

**Rationale**: owner confirmed PR #64 in the test project has two
user-authored comments. Using the existing `AZDO_PR_ID` env var keeps the
test gate consistent with the rest of the integration suite (no new env
var introduced). Test documentation points at `AZDO_PR_ID=64` as the
canonical value.

**Alternatives considered**:
- Hard-code `64`: rejected — the test project is owner-managed and the id
  may differ in forks / mirrors; env var wins.
- Mocked HTTP: rejected — the spec explicitly asks for an integration test
  against a real PR (FR-013 / FR-014).

**Resolve/reopen integration test**: separate test, also `AZDO_PR_ID`
gated, that picks the first active thread, resolves it, re-fetches and
asserts status is `fixed`, reopens, re-asserts `active`. This is
self-healing (it always returns the thread to the starting state), so it's
safe to run against a shared test PR.

## 7. Commander.js patterns used

**Decision**: follow the exact pattern in
`src/commands/pr.ts:createPrCommentsCommand` for the two new commands.
Each new command:
- Registers under the existing `pr` parent command in `src/commands/pr.ts`.
- Takes `--org` / `--project` / `--json` (already shared), plus
  `--pr-number <N>` where applicable, and a positional `<threadId>` for
  the state-change commands.
- Reuses `validateOrgProjectPair`, `resolvePrCommandContext`, and
  `handlePrCommandError`.

**Rationale**: Single Responsibility (principle III) + Simplicity
(principle V) — one file touched for all three commands.

## 8. README update

**Decision**: append a short "Pull request comments" section (or extend
the existing PR section if one exists) documenting the `pr comments`
flags (`--pr-number`, `--hide-resolved`) and the two new subcommands.

**Rationale**: constitution workflow rule — "After every completed SpecKit
spec run, README.md MUST be reviewed and updated to reflect the
implemented functionality, commands, options, and usage examples before
merge."

## 9. Consequences for existing callers

- `ActiveCommentThread.status` widens from `"active" | "pending"` to the
  full Azure DevOps status enum. All existing consumers either don't
  inspect `status` or format it as a string — no breaking behaviour.
- `mapPullRequest` returns `url: string | null` instead of `url: string`.
  The only current consumer (`formatPullRequestInfo` in `src/commands/pr.ts`)
  uses `url` in a template; pass through an em-dash when null. Backward
  compatible in the happy path.

No other call-site changes needed.
