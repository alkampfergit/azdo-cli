# PR Report: Secure PAT Storage and `auth` Command

**Branch**: `016-pat-secure-storage`
**Date**: 2026-04-22
**Spec**: [specs/016-pat-secure-storage/spec.md](./spec.md)

## Summary

Adds an `azdo auth` command that captures a Personal Access Token interactively (or via stdin for scripts), validates it against Azure DevOps, and stores it in the OS-native secret vault keyed per Azure DevOps organization. Every authenticated `azdo` command now resolves its target org via a hybrid chain — `--org` flag → git-remote auto-detect → persistent `azdo config set org` → error — and transparently reads the org's PAT from the vault. Two sibling subcommands (`auth status`, `auth logout`) let users inspect and remove stored credentials without ever exposing the full PAT.

## What's New

- **`azdo auth` command tree**: Three new subcommands (`auth`, `auth status`, `auth logout --org <name>|--all`) registered via commander. Interactive paste and stdin piping both supported (FR-002, FR-011). Exit codes mapped per contract (0 / 1 / 2 / 3 / 4).

- **Multi-organization credential storage**: `src/services/credential-store.ts` now keys PATs as `Entry("azdo-cli", "pat:<org>")`, supporting one stored PAT per Azure DevOps organization concurrently. `CredentialStoreUnavailableError` surfaces explicitly when the OS vault backend is missing (FR-010) — no silent plaintext fallback.

- **Hybrid org resolver**: New `src/services/org-resolver.ts` implements `resolveOrg()` with the order `--org → git remote → config.json → error`. `src/services/context.ts` refactored to use it; the change ripples to every existing authenticated command.

- **Browser-assisted PAT creation**: New `src/services/browser-open.ts` shells out to native `open` / `xdg-open` / `start` (no new runtime dependency). Headless systems cleanly fall back to URL-print.

- **PAT validation before storage**: New `validatePatAgainstAzdo()` helper hits `GET /_apis/projects?$top=1` against the target org before persisting. Invalid PATs never reach the vault.

- **Audit log**: New `~/.azdo/audit.log` (JSONL, `0600` perms) records `auth.store` / `auth.delete` / `auth.validate.*` events with a masked identifier. Full PAT never written. File created with `0700` parent-dir perms on first use.

- **Legacy PAT migration**: Lazy, opt-in move of the pre-existing single-slot PAT (ACCOUNT=`pat`) into the per-org keying when the user runs any auth flow AND `config.org` is set. Otherwise a single `stderr` notice instructs the user to re-store via `azdo auth --org <name>`.

- **`clear-pat` deprecated**: Kept as a thin alias with a one-line `stderr` deprecation notice pointing users at `azdo auth logout`. No behaviour change.

## Breaking Changes

- **`context.ts` org resolution order changes** — previously `flag → config → git-remote`, now `flag → git-remote → config` (per FR-013). Users whose workflow relied on a persistent `azdo config set org` value winning over a git remote that points at a different org will see the git remote win instead. Explicitly settable via `--org` on any invocation.
- **`credential-store` API** — the no-arg forms `getPat()` / `storePat(pat)` / `deletePat()` are gone; the new signatures require an `org` argument. All in-tree call sites migrated in the same PR. External consumers (none known) would need to update.

## Testing

- **Unit**: New / extended suites for `org-resolver`, `credential-store` (multi-org + migration + unavailable-backend), `audit-log` (permissions, append-only, masking), `auth` (`resolvePat(org)` + env-var precedence), `context.resolveContext` (new ordering), `auth` command (all three subcommands, all exit codes, stdin path, overwrite-confirm), `validatePatAgainstAzdo` (HTTP mock), `browser-open` (per-platform command, headless fallback).
- **Integration** (opt-in via `AZDO_INTEGRATION=1`): real-keyring round-trip in `tests/integration/auth.integration.test.ts` — store → status → logout on the host platform's native backend. Does NOT hit Azure DevOps (that's reserved for the manual quickstart walkthrough — no test PAT leaked into CI).
- **Manual**: `specs/016-pat-secure-storage/quickstart.md` walkthrough run on the developer host; output captured in a follow-up commit on this branch.
- **Gates**: `npm test && npm run lint && npm run build` green on branch tip before marking the PR ready.

## Notes

- OAuth / OIDC device-code auth is explicitly out of scope (deferred per spec §Assumptions).
- The feature does NOT create a git tag, cut a GitHub release, or bump any version — gitflow release is a separate owner-driven flow.
- This PR closes #33.
