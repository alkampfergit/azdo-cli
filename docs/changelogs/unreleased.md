# Unreleased — targeting 0.11.0

> Working detail for the next release (the `release/0.11.0` branch in flight).
> The `changelog` skill renames this file to `docs/changelogs/0.11.0.md` when
> the release is cut. Only keep categories that have entries.

### Added

- **OAuth login** — `azdo auth login` with one-command browser login and a headless / no-browser fallback (`018-oauth-login`, #37/#38).
- **`azdo pipeline` command group** — inspect and operate Azure DevOps pipelines: `list` (`--filter`), `get-runs` (`--limit`/`--branch`), `wait` (blocks until a run finishes and maps the result to the process exit code: `0` success, `1` failed, `2` canceled, `124` on `--timeout`), `get-run-detail` (execution date, built commit, result, errors, failing-test count, per-stage status, web link), `logs` (`--log-id`), and `start` (`--branch`, repeatable `--parameter key=value`). `--json` on every subcommand; built for CI / AI-agent loops. No new runtime dependencies (`024-azdo-pipeline`, #51).

### Fixed

- **`azdo pr` on valid Azure DevOps remotes** — recognise remotes that carry userinfo (e.g. `user@dev.azure.com`) so PR auto-detection no longer errors (`019-fix-pr-command`, #40/#43).

### Changed

- **Authentication docs** — synced `README.md`, `docs/commands.md`, and `docs/linux-credential-store.md` with the current auth surface; documented `azdo auth login` (OAuth default) alongside the PAT fallback (`020-auth-docs-sync`, #41/#42).
