# PR Report: Fix URL Percent-Encoding for ADO Project Names with Spaces

**Branch**: `031-fix-project-url-encoding`
**Date**: 2026-06-16
**Spec**: [specs/031-fix-project-url-encoding/spec.md](specs/031-fix-project-url-encoding/spec.md)

## Summary

Fixes a double-encoding bug where `azdo` commands that auto-detect the Azure DevOps project from the git remote URL would produce malformed API URLs (e.g., `Course%2520Examples%2520Builds` instead of `Course%20Examples%20Builds`) for projects whose names contain spaces. The root cause was that the git remote URL parser stored the raw percent-encoded project segment without decoding it; downstream URL construction then re-encoded the `%` sign. Adding a `decodeURIComponent` call at the two extraction sites fixes the issue with no change to the CLI surface or any dependency.

## What's New

<!-- Filled in after /speckit-implement completes -->

- **`src/services/git-remote.ts` — URL parsing fix**: [placeholder]
- **`tests/unit/git-remote.test.ts` — test coverage**: [placeholder]

## Testing

<!-- Filled in after /speckit-implement completes -->

- **Unit — `parseAzdoRemote`**: [placeholder]
- **Unit — `matchAzdoRemote` / `parseAllAzdoRemotes`**: [placeholder]
- **Regression — FROZEN_BASELINE**: [placeholder]

## Notes

- Explicit `--project` values are unaffected; they bypass the git remote parsing path entirely.
- The `decodePctSegment` helper gracefully handles malformed percent-encoded sequences (e.g., `%GG`) by returning the raw segment unchanged rather than throwing.

Closes #71
