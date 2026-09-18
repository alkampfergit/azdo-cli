# azdo-cli Agent Notes

`AGENTS.md` is the authoritative repository memory and agent guidance file for this project.

## Repository Memory

### Active Technologies
- TypeScript 5.x (strict mode) on Node.js LTS (18+) + commander.js (existing), @napi-rs/keyring (new - cross-platform OS credential store) (002-get-item-command)
- Cross-platform OS credential store via @napi-rs/keyring for PAT persistence: Windows Credential Manager, macOS Keychain, Linux Secret Service (002-get-item-command)
- TypeScript 5.x (strict mode) + commander.js (CLI framework, existing), node:fs and node:path (config file I/O, built-in) (003-cli-settings)
- JSON file at `~/.azdo/config.json` via `node:fs` (003-cli-settings)
- TypeScript 5.x (strict mode) + commander.js (CLI framework), @napi-rs/keyring (credential store) - both existing (004-update-work-item)
- N/A (no local storage; updates go to Azure DevOps API) (004-update-work-item)
- TypeScript 5.x (strict mode) on Node.js LTS + commander.js (CLI framework), node-html-markdown (HTML→MD conversion, zero deps, native TS) (005-md-field-commands)
- N/A (reads/writes to Azure DevOps API) (005-md-field-commands)
- TypeScript 5.x (strict mode) + commander.js (CLI framework), node-html-markdown (HTML→MD, existing) (006-auto-md-display)
- `~/.azdo/config.json` (existing config file, new `markdown` boolean key) (006-auto-md-display)
- TypeScript 5.x (strict mode) on Node.js LTS + commander.js (CLI framework), node-html-markdown (existing rich-text support), node:fs/node:path (built-in file handling); no new parser dependency planned (007-work-item-upsert)
- N/A (reads inline/file input and writes to Azure DevOps API only) (007-work-item-upsert)
- TypeScript 5.x (strict mode), Node.js LTS (18+) + commander.js (CLI), native `fetch` (HTTP), `node:child_process` execSync (git commands) - all existing (008-pull-request-handling)
- N/A (reads and writes to Azure DevOps API only) (008-pull-request-handling)
- TypeScript 5.x (strict mode) on Node.js LTS + commander.js, built-in `fetch`, built-in `node:child_process`, existing auth/context services (008-pull-request-handling)
- N/A (reads local git state and Azure DevOps APIs only) (008-pull-request-handling)
- TypeScript 5.x (strict mode) on Node.js LTS + commander.js, native `fetch`, existing auth/context helpers, node:fs only where already present (010-work-item-comments)
- N/A (reads from and writes to Azure DevOps Work Item Tracking APIs only) (010-work-item-comments)
- TypeScript 5.x (strict mode), Node.js LTS (18+) + commander.js (CLI), node-html-markdown (HTML→MD conversion) (012-fix-markdown-field-formatting)
- TypeScript 5.x (strict mode), Node.js LTS (18+) + commander.js (CLI), node-html-markdown (HTML→MD, existing) (013-comments-markdown)
- N/A - reads/writes Azure DevOps REST API only (013-comments-markdown)
- TypeScript 5.x (strict mode) on Node.js LTS (18+) + commander.js (CLI framework), native `fetch` (HTTP) (014-work-item-attachments)
- N/A (reads from Azure DevOps API, writes binary files to local filesystem) (014-work-item-attachments)
- TypeScript 5.x (strict mode) on Node.js LTS + commander.js (CLI framework), tsup (bundler) (001-azdo-cli-base)

### Project Structure

```text
src/
tests/
```

### Commands

- full test suite and linter `npm test && npm run lint`
- unit tests `npm run test:unit`
- integration tests `npm run test:integration`

### Code Style

TypeScript 5.x (strict mode) on Node.js LTS: Follow standard conventions.

### Recent Changes
- 008-pull-request-handling: Added TypeScript 5.x (strict mode), Node.js LTS (18+) + commander.js (CLI), native `fetch` (HTTP), `node:child_process` execSync (git commands) - all existing
- 007-work-item-upsert: Added TypeScript 5.x (strict mode) on Node.js LTS + commander.js (CLI framework), node-html-markdown (existing rich-text support), node:fs/node:path (built-in file handling); no new parser dependency planned
- 006-auto-md-display: Added TypeScript 5.x (strict mode) + commander.js (CLI framework), node-html-markdown (HTML→MD, existing)
- 005-md-field-commands: Added TypeScript 5.x (strict mode) on Node.js LTS + commander.js (CLI framework), node-html-markdown (HTML→MD conversion, zero deps, native TS)

## Codex Memory

- Keep repository memory here rather than in `CLAUDE.md`.
- For work item writes, the transport layer already accepts an arbitrary JSON Patch operation array via `updateWorkItem()`. Command-level limits are narrower than client-level limits.
- `set-md-field` currently exposes exactly one `<field>` argument and emits two operations for that field: `/fields/<field>` and `/multilineFieldsFormat/<field>` with `Markdown`.

Working defaults:
- Run `npm test && npm run lint` before wrapping up when the change warrants it.
- Use `npm run test:unit` or `npm run test:integration` for focused reruns when full-suite validation is unnecessary.
- Prefer minimal, targeted edits that preserve the existing CLI structure.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking - do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge - do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->

## Active Technologies
- TypeScript 5.x (strict mode), Node.js LTS + Node.js built-in `readline`, `process.stdin` raw mode (015-fix-pat-visibility)
- TypeScript 5.x strict on Node.js LTS (≥18) — no change + `commander.js` (CLI), `@napi-rs/keyring` (credential store, already a dependency) (016-pat-secure-storage)
- OS secret vault for PATs (Windows Credential Manager / macOS Keychain / Linux libsecret via `@napi-rs/keyring`); `~/.azdo/config.json` for non-secret prefs; `~/.azdo/audit.log` (new, JSON-lines) for credential-event audit trail (016-pat-secure-storage)
- TypeScript 5.x (strict mode) on Node.js LTS (≥18, native `fetch`) + `commander` (CLI, existing), `@napi-rs/keyring` (credential store, existing), `node:http` (loopback callback, built-in), `node:crypto` (PKCE + state, built-in), native `fetch` (token exchange, built-in) (018-oauth-login)
- per-org records in OS credential store via `@napi-rs/keyring` (existing `services/credential-store.ts`); the stored value is JSON `{ kind: 'pat' | 'oauth', token, refreshToken?, expiresAt?, accountId?, scope?, issuedAt }`. Existing PAT entries (`pat:<org>` account) MUST be readable as `kind: 'pat'` for backwards compatibility — see Migration below. (018-oauth-login)
- TypeScript 5.x (strict mode) + commander.js (existing), native `fetch` (existing), `node:child_process` `execSync` for `git remote get-url origin` and `git rev-parse --abbrev-ref HEAD` (existing). No new runtime deps. (019-fix-pr-command)
- TypeScript 5.x (strict mode) + commander.js (CLI, existing), native `fetch` (existing, via `downloadAttachment`), `node:fs/promises` + `node:path` + `node:os` (built-in, file/temp-dir I/O), **`jimp` (new — pure-JS image resize/encode)** (021-download-markdown-images)
- Local filesystem — image files written to OS temp dir by default or a `--images-path` directory (021-download-markdown-images)
- TypeScript 5.x (`strict: true`) on Node.js LTS (18+) + commander.js (CLI), native `fetch` (HTTP), `node:child_process` execSync (git), `node:fs`/`node:path`/`node:os` (config I/O) — all existing; **no new dependencies** (025-multi-org-support)
- JSON file at `~/.azdo/config.json` (existing; extended with an `organizations` map) (025-multi-org-support)
- TypeScript 5.x (strict mode), Node.js LTS + commander.js (CLI), native `fetch` (HTTP) — no new deps (027-work-item-relations)
- TypeScript 5.x (strict: true) + commander.js (CLI framework), native `fetch` (HTTP), vitest (tests) (028-pr-comment-line)
- TypeScript 5.x (strict mode) + commander.js (CLI), native `fetch` (HTTP) (029-pr-comment-reply)
- TypeScript 5.x (strict mode), Node.js LTS + commander.js, native `fetch`, Node.js built-ins — no new dependencies (031-fix-project-url-encoding)
- TypeScript 5.x (strict) + `node-html-markdown ^2.0.0` (existing), no new dependencies (032-fix-code-generics)
- TypeScript 5.x (strict mode) + commander.js (CLI), native `fetch` (HTTP), `node:fs` for `--file` bodies — all existing, no new dependencies (033-pr-comment-authoring)
- TypeScript 5.x (strict mode) — unchanged + commander.js, native `fetch` (via existing `fetchWithErrors`/`authHeaders`) — no new dependencies (034-pr-link-review)
- N/A (all state lives in Azure DevOps) (034-pr-link-review)
- TypeScript 5.x (`strict: true`) on Node.js LTS (18+) — unchanged + commander.js (CLI, existing), native `fetch` (HTTP, existing) — no new dependencies (036-workitem-attachment-crud)
- N/A (reads a local file to upload; all state lives in Azure DevOps) (036-workitem-attachment-crud)

## Recent Changes
- 040-auth-token: new `azdo auth token` prints the credential the CLI itself would use for an org on **stdout and nothing else** (one trailing newline), so a capability gap the CLI does not yet wrap no longer forces the operator to mint a second PAT. It rides the existing resolution ladder — `AZDO_PAT` → stored credential → `.env` → and an expired OAuth access token is refreshed first, so the exported token is never already dead. The ladder itself moved into a new `exportCredential()` in `src/services/auth.ts` that also carries `source` / `expiresAt` / `accountId`; `resolveCredential()` is now a two-line projection of it, so “the token azdo sends” and “the token azdo prints” cannot drift. **Ungated** — no flag, no prompt, matching `gh auth token` / `az account get-access-token`: the credential is already readable by anything running as this user, and a gate would break the scripted use that motivated it. **No `--json`** (the payload is one opaque string; `azdo auth status --json` stays the machine-readable metadata view, tokenless by design). Because Azure DevOps takes a PAT as `Basic` and an Entra token as `Bearer` while documenting tokens as opaque, the credential's kind/source/account/expiry and the header form go to **stderr, TTY-gated** — silent on a pipe. A successful export appends the new `auth.token` audit event (org + backend + OAuth accountId; never token material), written *before* the stdout write. Exit codes reuse the group's contract (1 missing/refresh-rejected, 3 org unresolved, 4 vault unavailable) and stdout stays empty on all of them. Review round: `resolveAuthCredential()` — the ladder the *write-side* commands reach through `requireAuthCredential()` — is now a projection of `exportCredential()` too (returning `null` instead of throwing, and folding `dotenv` back into the pinned `env` source), so the PR leaves **one** ladder rather than two that can drift; the credential store's advisory stderr notices (the legacy-PAT migration line) are suppressed via `suppressCredentialStoreNotices()` when `auth token` runs with a non-TTY stderr, since the migration would otherwise interleave with the token on a merged stream; and the command is exempt from the root `postAction` update check (`skipsUpdateCheck()`), so an OAuth refresh stays the only network request it can make. Second review round: the tree/hook wiring moved out of `src/index.ts` into a new `createProgram()` in `src/program.ts` (index keeps only the EPIPE guards and `parseAsync`) and `commandPathOf()` moved next to `skipsUpdateCheck()`, so `tests/unit/entry-update-check.test.ts` can drive the **real** command tree and pin that `auth token` never reaches `getUpdateNotice()` while a sibling still does — the skip is a property of the wiring, which the hand-built-path unit tests could not see. No new dependencies.
- 039-pr-abandon: `azdo pr abandon` (alias `pr close`) and `azdo pr reactivate` end and restore a pull request via 038's `updatePullRequest()` with a status-only body (`{"status":"abandoned"}` / `{"status":"active"}`). Two subcommands rather than `pr abandon --reactivate` (Principle III); `resolvePullRequestTarget` takes `{ branchStatus }` (default `'active'`, so the pinned 019 C-2/C-3 strings never move) and `reactivate` searches **abandoned** PRs for the branch. Completed PRs are refused client-side before any write; already-in-status is a `noop: true` no-op; neither command ever prompts. Review round: `resolvePullRequestTarget` now takes an `onContextResolved` callback that fires as soon as the org/project/repo are known — a 401/403 from the target *lookup* (not the PATCH) used to reach `handlePrCommandError` with no context and report `project "undefined"` — and the same resolver was split into `parseTargetPrNumber` / `fetchTargetById` / `findBranchPullRequest` to clear SonarCloud's cognitive-complexity rule (21 → under the 15 allowed). No new dependencies.
- 037-api-error-surfacing: every Azure DevOps failure now carries the server's own `message`/`typeKey` — `fetchWithErrors` reads each non-ok body once and stashes it in a `WeakMap<Response, string>`, the new synchronous `httpError(response)` replaces the 18 bare ``throw new Error(`HTTP_${response.status}`)`` sites, and 401/403 become `AUTH_FAILED: <detail>` / `PERMISSION_DENIED: <detail>`. The sentinel stays a **prefix**: twelve `=== 'AUTH_FAILED'` / `=== 'PERMISSION_DENIED'` comparisons became `isSentinel(...)` so the curated guidance and the `pr` exit code 4 survive the suffix. Review round: the detail is now also scrubbed of token-shaped runs in free text (`redactText`), the curated `BAD_REQUEST`/`CREATE_REJECTED`/`UPDATE_REJECTED` 400s carry `typeKey`/`errorCode` and reuse the single body read, `IDENTITY_SCOPE_MISSING` keeps the server detail, and the overflow message always names all three character counts. `pr open` now pre-flights the **composed** description (your text + separator + repository template) against the documented 4000-character cap and fails before the create call naming every contribution; an unexpected 400 gets the same arithmetic appended. No new dependencies.
- 033-pr-comment-authoring: The `pr` group can now author comments, not just read and reply to them — `pr comments add` creates a new overview thread (`POST .../threads`), `pr comments edit` rewrites a comment in place (`PATCH .../threads/{t}/comments/{c}`), both with `--file` / `--dry-run` and top-level `comment-add` / `comment-edit` aliases. `pr list` answers "which PR is this branch?" in one call (`--branch`, `--status`, `--top`) where `pr status` costs three extra calls per PR. `pr comments` gains `--exclude-system` / `--max-chars`, `reply` gains `--file`, and every `pr` subcommand gains `--repo` (registered once via `withCommonPrOptions()`). Mapped PRs now carry `description`, mapped comments carry `commentType`. The four PowerShell helpers under `scripts/` were deleted: this repository ships Azure DevOps capability as CLI commands only, never as scripts. No new dependencies.
- 019-fix-pr-command: `azdo pr` now recognises HTTPS remotes with a `<user>[:<token>]@` userinfo prefix and an optional `.git` suffix (one-time, sanitised stderr credential warning; host allow-list unchanged). The single-PR commands (`pr comments` / `comment-resolve` / `comment-reopen`) document the branch→PR auto-detection rule in `--help` and fail cleanly on zero/multi-match; `pr status` stays a multi-PR list (decision A). No new runtime deps.
- 015-fix-pat-visibility: Updated PAT prompt behavior to use `readline` with `output: null` and raw stdin handling so the token is never echoed during entry
