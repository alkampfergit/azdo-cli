# PR Report: Fix URL Percent-Encoding for ADO Project Names with Spaces

**Branch**: `031-fix-project-url-encoding`
**Date**: 2026-06-16
**Spec**: [specs/031-fix-project-url-encoding/spec.md](specs/031-fix-project-url-encoding/spec.md)

## Summary

Fixes a double-encoding bug where `azdo` commands that auto-detect the Azure DevOps project from the git remote URL would produce malformed API URLs (e.g., `Course%2520Examples%2520Builds` instead of `Course%20Examples%20Builds`) for projects whose names contain spaces. The root cause was that the git remote URL parser stored the raw percent-encoded project segment without decoding it; downstream URL construction then re-encoded the `%` sign. Adding a `decodeURIComponent` call at the two extraction sites in `src/services/git-remote.ts` fixes the issue with no change to the CLI surface or any dependency.

## What's New

- **`src/services/git-remote.ts` — URL parsing fix**: Added `decodePctSegment()` helper (wraps `decodeURIComponent` with a try/catch for malformed encodings) and applied it in both `matchAzdoRemote` and `parseAzdoRemote`, so the project name is decoded to plain text (e.g., `Course Examples Builds`) before any API URL construction.
- **`tests/unit/git-remote.test.ts` — test coverage**: Updated one existing assertion that was encoding the bug (`project: 'my%20project'` → `'my project'`); added 5 new test cases covering the issue URL, multi-space names, userinfo-prefix remotes, end-to-end git-config parsing, and malformed-encoding resilience.
- **`docs/commands.md` — documentation**: Added a note to the project resolution order clarifying that project names with spaces are decoded automatically from the remote URL.

## Testing

- **Unit — `parseAzdoRemote`**: Verified that `Course%20Examples%20Builds` → `Course Examples Builds`, multi-space names, and userinfo-prefix URLs all decode correctly.
- **Unit — `matchAzdoRemote` / `parseAllAzdoRemotes`**: End-to-end test from a raw `.git/config` content → `RemoteCandidate.project` is the decoded name.
- **Unit — malformed encoding resilience**: `%GG`-style sequences return the raw segment without throwing.
- **Regression — FROZEN_BASELINE**: All 5 canonical URL forms in `tests/unit/fixtures/git-remote.cases.ts` pass unchanged (none contain percent-encoded segments).
- **Full suite**: 947 tests passed, 18 skipped — zero regressions.

## Notes

- Explicit `--project` values are unaffected; they bypass `git-remote.ts` entirely.
- Org name decoding (`match[1]`) was intentionally left out of scope — org names do not contain spaces in practice. Can be a follow-up if needed.

Closes #71
