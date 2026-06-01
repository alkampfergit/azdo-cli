# Research — 019-fix-pr-command

Phase 0 decision log. All four research items below resolve any latent `NEEDS CLARIFICATION` that the planning phase could have raised.

## R-1 — URL recognition: how to accept userinfo + `.git`

**Decision**: extend the existing regex set in [`src/services/git-remote.ts`](../../src/services/git-remote.ts) (the `patterns: RegExp[]` array) in place. Each pattern grows an optional `(?:[^@/]+@)?` userinfo group between `https?://` and the host literal, and an optional `(?:\\.git)?` tail before the end-anchor. The SSH patterns are left untouched (they already accept arbitrary userinfo via `[^@]+@`).

**Rationale**:
- Smallest possible diff. The current parser is a four-line `for` loop returning on the first match; the patch is purely additive to the regex strings.
- Preserves the special-cased `DefaultCollection` behaviour that the regex set encodes — `parseAzdoRemote` already inspects `match[2]` for `DefaultCollection` and re-points `org`/`project` accordingly. A different parser would have to replicate that branch.
- The host set stays a literal allow-list. There is no risk of accidentally widening to other hosts (FR-003) because each pattern still ends with `dev\\.azure\\.com\\/...`, `[^.]+\\.visualstudio\\.com\\/...`, etc.

**Alternatives considered**:
- **`URL.parse()` from `node:url`**. Cleaner authority handling and would resolve userinfo for free, but the legacy `*.visualstudio.com` patterns currently distinguish the `DefaultCollection` case by regex index, and the `org` is encoded in the *hostname* (`<org>.visualstudio.com`) rather than the path. Switching to `URL` requires re-implementing that org extraction. Larger blast radius for the same outcome.
- **Pre-strip userinfo and `.git` from the input string before the regex loop**. Tempting and very small, but it would silently lose the information that the URL was credential-bearing, which we need for the one-time warning (R-2). Decided against because the credential-bearing signal would have to be tracked on the side anyway.

**Negative-test commitments** (drive Phase 2 test design):
- `https://user@dev.azure.com.evil.example/...` MUST NOT match.
- `https://user@github.com/owner/repo.git` MUST NOT match.
- `https://prxm@dev.azure.com/prxm/Jarvis/_git/jarvis-claude-plugin.git` MUST match (org=prxm, project=Jarvis, repo=jarvis-claude-plugin).

## R-2 — Credential warning: where the singleton lives

**Decision**: a tiny new module [`src/services/remote-warning.ts`](../../src/services/remote-warning.ts) holding a module-scope `boolean` (`warned = false`) and an exported `noticeCredentialBearingRemote(): void` that writes a fixed string to `process.stderr` exactly once per process. `parseAzdoRemote()` (and `parseRepoName()` only if it can be called independently of `parseAzdoRemote()` for the same URL) calls the notifier when its successful match contains userinfo. The module also exports `__resetForTests()`.

**Rationale**:
- The flag is process-local — exactly the scope FR-004a calls for ("one-time per CLI process").
- A separate file lets the warning behaviour be tested without spinning up the full git-remote module surface (no `execSync` mock needed).
- Writing directly to `process.stderr` matches the pattern used elsewhere in the repo's CLI (`writeError` in `pr.ts`). No new abstraction.

**Alternatives considered**:
- **Inline in `git-remote.ts`** — saves a file but couples warning state to the parser module. Rejected because state-bearing modules are easier to reason about when they're alone.
- **EventEmitter** — overkill; there is exactly one event and exactly one consumer (stderr). Constitution V (Simplicity) rejects this.
- **Environment-variable opt-out** (`AZDO_SUPPRESS_CRED_WARNING=1`). YAGNI: no one has asked, and the warning fires once per process — script users see it at most once per CI job.

## R-3 — Multi-match aggregation: who owns the count

**Decision**: keep the API client in [`src/services/pr-client.ts`](../../src/services/pr-client.ts) returning the full result array from `listPullRequests()` (unchanged from today). The command layer (`pr.ts`) is responsible for the uniqueness check; on `results.length > 1` it assembles the FR-006 error string (with the searched branch name + every PR number) and exits non-zero.

**Rationale**:
- `pr-client.ts` is a thin API binding; UX decisions (error string format, exit codes, prompting) do not belong there.
- The single-match happy path stays byte-identical (FR-007) because the new branch is gated entirely on `length > 1`.

**Alternatives considered**:
- **Have `pr-client.ts` throw a typed `MultiMatchError`**. Slightly cleaner separation but creates a new exception type to thread through `pr.ts`; not worth it for a one-off case.
- **Auto-pick the most recent PR**. Already rejected by Q1 (option A — list and abort).

## R-4 — Help-text wording for `--pr-number`

**Decision**: a single shared sentence constant exported from `src/commands/pr.ts` (or a sibling module if the same constant is needed elsewhere) and referenced by every `--pr-number` option declaration:

> *"target the pull request with this numeric id, instead of the current branch's PR. When omitted, the CLI auto-detects the pull request whose source branch equals `refs/heads/<current branch>` in the Azure DevOps repository identified by the `origin` remote; if zero or more than one open PR matches, the command fails with a message naming the searched branch."*

**Rationale**:
- Single source of truth — no drift between `status`, `comments`, `comment-resolve`, `comment-reopen`.
- Covers the three FR-005 ingredients in one breath: inputs (current branch + origin), match criterion (source branch equality), precedence rule (explicit flag wins).
- The wording is testable: a unit test asserts the string is present in the rendered help for every subcommand carrying `--pr-number`.

**Alternatives considered**:
- **Bespoke wording per subcommand**. Rejected: drift risk and duplicated maintenance with no UX gain.
- **A README section linked from `--help`**. Rejected: extra navigation step for what should fit in two sentences inline.
