# PR Report: Check for new stable version on startup

**Branch**: `022-version-update-check`
**Date**: 2026-06-03
**Spec**: [specs/022-version-update-check/spec.md](./spec.md)

## Summary

`azdo` now performs a lightweight, throttled, non-blocking check for a newer
**stable** release on the npm registry and, when one is found, prints a single
upgrade line to stderr after the command's own output. The check is best-effort
— it never blocks the command, never changes the exit code, is suppressed in
non-interactive output, and can be disabled with `--no-update-check`.

## What's New

- **Update-check service (`src/services/update-check.ts`)**: a new self-contained
  module that reads a small `~/.azdo/update-check.json` cache, throttles registry
  lookups to at most one per 10 minutes, fetches the `latest` stable version from
  `registry.npmjs.org` under a 1500 ms abort timeout, compares it numerically
  against the running version, and returns a one-line notice only when a fresh,
  successful check finds something newer. Every step is wrapped so it can never
  throw or block the user's command.
- **CLI wiring (`src/index.ts`)**: a global `--no-update-check` flag, the entry
  point switched to `parseAsync()`, and a `postAction` hook that writes the
  notice to **stderr after** the command's own output. The hook does not fire for
  `-v/--version` or help, so those paths stay silent.
- **Failure & suppression semantics**: the notice is suppressed when output is
  non-interactive (`!process.stderr.isTTY`) or when `--no-update-check` is set; a
  failed/timed-out check leaves the cache unchanged so the throttle window is not
  reset; a corrupt or missing cache is tolerated as "no recent check".
- **Docs (`docs/commands.md`)**: a new "Update notifications" section describing
  the behaviour, the 10-minute throttle, the `--no-update-check` opt-out, and the
  non-interactive suppression.

## Testing

- **Unit (`tests/unit/update-check.test.ts`, 21 cases)**: cover contract cases
  C1–C8 — suppression (disabled / non-TTY), throttle (within / elapsed window),
  failure safety (fetch returns null or throws → cache untouched), tolerant cache
  parsing (corrupt / missing / wrong-shape), and `isNewer` semantics (newer /
  equal / older / pre-release precedence / `v` prefix / build metadata /
  unparseable). All dependencies (clock, fs, fetch, TTY, version) are injected so
  no test performs real I/O.
- **Full suite**: `npm run lint`, `npm run typecheck`, `npm run build`, and
  `npm test` (757 passed, 7 skipped, 0 failed) all green.
- **Manual smoke**: `azdo --help` lists `--no-update-check`; `azdo
  --no-update-check config list` runs without crashing and emits no notice.

## Notes

- No new runtime dependency — native `fetch` plus `node:fs` / `node:os` /
  `node:path` only.
- The notice goes to stderr only; stdout / `--json` output and process exit codes
  are untouched.
