# PR Report: Sync authentication docs

**Branch**: `020-auth-docs-sync`
**Date**: 2026-05-29
**Spec**: [specs/020-auth-docs-sync/spec.md](spec.md)

## Summary

The authentication documentation had drifted from the CLI: the entry-point docs (`README.md`, `docs/commands.md`) predated the OAuth work (#37/#38) and only described the PAT path, making `azdo auth login` look unsupported (issue #41). This PR reconciles the auth docs with the actual `develop` command surface — documenting `azdo auth login` (OAuth default) alongside the PAT alternative — and verifies every documented command/flag against the built CLI. Documentation only; no source or behaviour changes.

## What's New

- **README authentication summary**: now presents `azdo auth login` (OAuth via Microsoft Entra, default) with PAT as the `--use-pat` alternative, instead of the old PAT-only `azdo auth` description. Added a sign-in line to Quick Start and relabelled the docs table row to "Authentication (OAuth & PAT)".
- **Command reference (`docs/commands.md`)**: added the missing `azdo auth login` row (with its full option set), reframed bare `azdo auth` as the legacy PAT-prompt alias, and updated `auth status` / `auth logout` descriptions to cover both OAuth and PAT (not PAT-only). `clear-pat` remains marked deprecated. The PR-command scope note now says "credential (OAuth or PAT)" rather than "PAT".
- **Linux credential store doc**: generalised "PAT" wording to "credentials (PAT or OAuth tokens)" for consistency.
- **Verified (no change needed)**: `docs/authentication.md` and `docs/oauth-app-registration.md` already matched the implemented surface; all internal cross-links across the touched docs resolve.
- **Encoded gotcha**: docs show the full `azdo auth login` usage (OAuth flags are inherited from the parent `auth` via `optsWithGlobals()`, so `auth login --help` looks bare but the flags work).

## Testing

- **Manual / quickstart verification**: built the CLI and diffed documented commands/flags against `auth --help`, `auth login/status/logout --help`, and `clear-pat --help`; confirmed the entry-point docs now show `auth login`; ran a repo-wide grep finding no remaining PAT-only stale phrasing; verified all internal cross-links resolve.
- **Repo checks (must-not-regress)**: `npm run lint` ✓, `npm run build` ✓, unit tests **546 passed**, integration tests **90 passed / 7 skipped** (pre-existing env-gated skips). No source files changed, so behaviour is unaffected.

## Notes

- Per the owner's **Option A** decision: `azdo auth login` is documented as current even though it is unreleased (on `develop`, no tag yet — latest release `0.10.1` predates it). No per-release version caveat. Cutting a release is out of scope for this issue.
