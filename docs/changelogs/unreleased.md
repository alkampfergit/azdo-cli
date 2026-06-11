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
- **`azdo pipeline` command group** — inspect and operate Azure DevOps pipelines: `list` (`--filter`), `get-runs` (`--limit`/`--branch`/`--commit`/`--pr`; runs are listed via the Build API so `sourceBranch`/`sourceCommit` are populated, branch filtering is server-side, and a commit SHA or PR number resolves to its runs without knowing the definition id), `wait` (blocks until a run finishes and maps the result to the process exit code: `0` success, `1` failed, `2` canceled, `124` on `--timeout`), `get-run-detail` (queue/start/finish times with computed duration, trigger reason and requestor, built commit, result, errors, per-stage **and per-job** status, web link, and the failing tests **by name** with the first line of each error message — test counts come from the stable Test Runs API, not the preview-only `ResultSummaryByBuild` endpoint that some collections reject), `logs` (each log labelled with its step/job from the build timeline; select by `--log-id` or `--step <name>`, slice with `--tail <n>` / `--grep <pattern>` / `--grep … --context <n>` for surrounding lines), `tests` (test summary + failing tests by name and error message; `--failed` for just the failures), and `start` (`--branch`, repeatable `--parameter key=value`). Piped output (`azdo … | head`) exits cleanly on EPIPE instead of crashing. `--json` on every subcommand; built for CI / AI-agent loops. No new runtime dependencies (`024-azdo-pipeline`, #51).
- **`azdo pr comments` filters** — `--code-related-only` (show only threads anchored to a file/line) and `--exclude-resolved` (alias of `--hide-resolved`); independent and combinable, default off (`023-pr-comments-status`, #50).
- **`azdo pr status` code-comment counts** — open/closed counts of code-anchored comment threads (`023-pr-comments-status`, #50).
- **`azdo pr comments` line-number display** — each code-anchored thread now shows `:<line>` after the file path (e.g. `/src/foo.ts:42`); extracted from `rightFileStart`/`leftFileStart` position data already returned by the ADO threads API; surfaced in both human-readable and `--json` output (`028-pr-comment-line`, #61/#63).

### Fixed

- **`azdo pr` on valid Azure DevOps remotes** — recognise remotes that carry userinfo (e.g. `user@dev.azure.com`) so PR auto-detection no longer errors (`019-fix-pr-command`, #40/#43).
- **`azdo pr status` reported "no checks"** — it now also fetches branch **policy evaluations** (build validation, required reviewers) and merges them with status-API checks, so green checks are surfaced; a retrieval failure shows "unable to retrieve" rather than masquerading as "none" (`023-pr-comments-status`, #50).

### Changed

- **Authentication docs** — synced `README.md`, `docs/commands.md`, and `docs/linux-credential-store.md` with the current auth surface; documented `azdo auth login` (OAuth default) alongside the PAT fallback (`020-auth-docs-sync`, #41/#42).
