# Quickstart — 017-pr-comments-threads

How a developer (or reviewer) exercises the feature end-to-end. Points
at the approved spec, the plan, and the contracts; tells you what to
configure and run.

## Prerequisites

- Node.js LTS (18+), npm.
- Checked out on branch `017-pr-comments-threads` (or any feature branch
  after merge).
- Azure DevOps PAT with at least *Code (read and write)* scope if you
  want to run the resolve/reopen path. Read-only is sufficient for
  listing.
- Credentials exported (or written to `../.env` relative to the repo
  root). The integration test harness accepts:

  ```env
  AZDO_PAT=<your-pat>
  AZDO_ORG=<your-org>
  AZDO_PROJECT=<your-project>
  AZDO_REPO=<your-repo>
  AZDO_PR_ID=64         # the reference test PR with two user comments
  ```

  See `tests/integration/helpers/integration-utils.ts` for the full list.

## Build + test locally

```bash
npm ci
npm run lint
npm run typecheck           # or `tsc --noEmit` if that's the project's alias
npm test                    # unit tests; skips integration suite without AZDO_* vars
npm test -- integration     # full suite when credentials are present
npm run build               # tsup bundle — must be zero warnings (constitution IV)
```

## Try the commands

Assume a PR exists for your current branch (or supply `--pr-number`):

```bash
# default read path — fixed in this feature; shows every thread incl. resolved
azdo pr comments

# target a PR by number regardless of the checked-out branch
azdo pr comments --pr-number 64

# focus on what still needs attention
azdo pr comments --pr-number 64 --hide-resolved

# machine-readable
azdo pr comments --pr-number 64 --json | jq '.threads[] | {id, status}'

# resolve a thread (idempotent — exit 0 either way)
azdo pr comment-resolve 17 --pr-number 64

# reopen it
azdo pr comment-reopen 17 --pr-number 64

# JSON output on the state-change commands
azdo pr comment-resolve 17 --pr-number 64 --json
# -> {"pullRequestId":64,"threadId":17,"status":"fixed","noop":false}
```

## Integration test expectations

With `AZDO_PR_ID=64` (or any PR you control that has threads), run:

```bash
npm test -- integration/pull-requests
```

The feature adds at least two gated tests:

1. **Read path** — calls `getPullRequestThreads` against
   `AZDO_PR_ID`, asserts ≥1 thread with ≥1 non-deleted comment, and
   asserts the command exits 0 when invoked with `--pr-number`.
2. **Round-trip state change** — picks the first active thread,
   resolves it, asserts the next list shows it as `fixed`, reopens it,
   asserts it shows as `active` again. This leaves the PR in its
   starting state.

Both tests live under `tests/integration/pull-requests.test.ts` inside a
`describe.skipIf(SKIP_PR || !AZDO_PR_ID)` block — absent creds skip
cleanly, the suite stays green in CI without them (FR-015).

## What to check manually (owner-facing)

- `azdo pr comments --pr-number 64` prints threads, exits 0, no stack
  trace, on macOS / Linux / Windows pwsh (the platform the original
  crash was reported on).
- `--hide-resolved` noticeably shortens the output on a PR with settled
  threads; without it, every thread appears with a status indicator
  prefix.
- `azdo pr comment-resolve 0 --pr-number 64` returns a validation error
  (thread id must be positive), exits non-zero, no crash.
- `azdo pr comment-resolve <existing-id> --pr-number 64` run twice in a
  row: first resolves, second is a no-op (exit 0 both times, `noop:true`
  on the second in `--json`).

## Pointers

- Approved spec: [spec.md](./spec.md)
- Implementation plan: [plan.md](./plan.md)
- Research decisions: [research.md](./research.md)
- Data model: [data-model.md](./data-model.md)
- CLI contracts: [contracts/cli-commands.md](./contracts/cli-commands.md)
- API contracts: [contracts/api-calls.md](./contracts/api-calls.md)
- Source surface: `src/commands/pr.ts`, `src/services/pr-client.ts`, `tests/integration/pull-requests.test.ts`.
