# PR Report: Multi-Organization Support

**Branch**: `025-multi-org-support`
**Date**: 2026-06-05
**Spec**: [specs/025-multi-org-support/spec.md](specs/025-multi-org-support/spec.md)

## Summary

Extends the Azure DevOps CLI to work reliably across multiple organizations: users can now maintain a default configuration plus per-org overrides (with full list/copy/move/delete management), commands recover gracefully when configured custom fields are absent in a target org (warn and render rather than failing outright), and org/project context is auto-detected from any Azure DevOps git remote — not only `origin`. Two quality-of-life improvements land alongside: git's own stderr noise is suppressed outside git repos, and the embedded-credentials warning fires only when a password/token is genuinely present (not for bare-username clone URLs).

## What's New

- **`config-store.ts` — per-org scoping**: New `ScopedSettings` interface; `CliConfig` extended with `organizations` map; `resolveScopedConfig(org?)` performs per-key fallback (org value ?? default); `setOrgScopedValue`, `getOrgScopedValue`, `unsetOrgScopedValue`; `copyOrgScope`, `moveOrgScope`, `deleteOrgScope` with `--force` support.

- **`config` CLI — org-scoped commands**: `config set/get/unset` gain `--org <name>` option; `config list` adds scope column in table output and structured `{ scope, key, value }` entries in `--json`; new subcommands `org-copy <from> <to> [--force]`, `org-move <from> <to> [--force]`, `org-delete <name>`.

- **`azdo-client.ts` — TF51535 graceful degradation**: `getWorkItem()` catches 400+TF51535, fetches the org field list via new `getOrgFieldNames()`, partitions configured extra fields into existing/missing, warns once per missing field on stderr, retries with only the existing fields. Commands no longer abort on unrecognised field names.

- **`git-remote.ts` — multi-remote discovery**: New `RemoteCandidate` type and `parseAllAzdoRemotes(output)` parse all remotes from `git remote -v`; `selectRemote(candidates)` chooses: prefers `origin`, falls back to single candidate or shared org/project, throws a clear ambiguity error listing remote names when multiple distinct orgs exist. `detectAzdoContext()` now enumerates all remotes (stderr suppressed) instead of only reading `origin`. `context.ts` uses `resolveScopedConfig(org)` for project lookup.

- **`remote-warning.ts` — credential-only trigger**: `noticeCredentialBearingRemote(remoteName)` now accepts the actual remote name (default `'origin'`), templates it into the warning message, and only fires when the URL carries both username AND password (`user:token@`). Bare `user@` URLs are no longer flagged. `org-resolver.ts` error guidance no longer hardcodes "origin".

## Testing

- **Unit**: 776 tests across 53 test files — all pass. New suites cover `resolveScopedConfig`, org-scoped CRUD, `parseAllAzdoRemotes`/`selectRemote`, TF51535 fallback, credential warning precision, and config CLI `--org` option.
- **Integration**: New `tests/integration/config-org.test.ts` — 11 tests covering `config list` scope display, `org-copy/move/delete`, and `--force` collision handling.
- **Gate**: `npm run test:unit && npm run lint && npm run build` — all pass (0 lint errors).

## Notes

- No new runtime dependencies — existing TypeScript 5.x / commander.js / native `fetch` stack.
- Backward-compatible config file: existing single-org configs continue to work unchanged as the default scope.
- The pre-existing `pull-requests.test.ts` integration flakiness (undefined thread status from live AzDO API) is not introduced by this PR.
