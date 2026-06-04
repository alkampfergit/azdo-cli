# Unreleased — targeting 0.12.0

> Working detail for the next release. The `changelog` skill renames this file
> to `docs/changelogs/0.12.0.md` when the release is cut. Only keep categories
> that have entries.
>
> Note: `0.11.0` is already published on npm (`latest`); the next release is
> `0.12.0`. Whether the OAuth / fix-pr / auth-docs items below already shipped
> in `0.11.0` should be reconciled via `changelog release` when the release is
> cut — they are left here untouched rather than guessed at.

### Added

- **OAuth login** — `azdo auth login` with one-command browser login and a headless / no-browser fallback (`018-oauth-login`, #37/#38).
- **`azdo pipeline` command group** — inspect and operate Azure DevOps pipelines: `list` (`--filter`), `get-runs` (`--limit`/`--branch`/`--commit`/`--pr`; runs are listed via the Build API so `sourceBranch`/`sourceCommit` are populated, branch filtering is server-side, and a commit SHA or PR number resolves to its runs without knowing the definition id), `wait` (blocks until a run finishes and maps the result to the process exit code: `0` success, `1` failed, `2` canceled, `124` on `--timeout`), `get-run-detail` (execution date, built commit, result, errors, per-stage status, web link, and the failing tests **by name** with the first line of each error message via the Test Results API), `logs` (`--log-id`, plus `--tail <n>` / `--grep <pattern>` to slice large logs), and `start` (`--branch`, repeatable `--parameter key=value`). `--json` on every subcommand; built for CI / AI-agent loops. No new runtime dependencies (`024-azdo-pipeline`, #51).
- **`azdo pr comments` filters** — `--code-related-only` (show only threads anchored to a file/line) and `--exclude-resolved` (alias of `--hide-resolved`); independent and combinable, default off (`023-pr-comments-status`, #50).
- **`azdo pr status` code-comment counts** — open/closed counts of code-anchored comment threads (`023-pr-comments-status`, #50).

### Fixed

- **`azdo pr` on valid Azure DevOps remotes** — recognise remotes that carry userinfo (e.g. `user@dev.azure.com`) so PR auto-detection no longer errors (`019-fix-pr-command`, #40/#43).
- **`azdo pr status` reported "no checks"** — it now also fetches branch **policy evaluations** (build validation, required reviewers) and merges them with status-API checks, so green checks are surfaced; a retrieval failure shows "unable to retrieve" rather than masquerading as "none" (`023-pr-comments-status`, #50).

### Changed

- **Authentication docs** — synced `README.md`, `docs/commands.md`, and `docs/linux-credential-store.md` with the current auth surface; documented `azdo auth login` (OAuth default) alongside the PAT fallback (`020-auth-docs-sync`, #41/#42).
