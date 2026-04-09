# PR Report: Fix PAT Input Visibility Bug

**Branch**: `015-fix-pat-visibility`
**Date**: 2026-04-09
**Spec**: [specs/015-fix-pat-visibility/spec.md](spec.md)

## Summary

Fixes a security bug where pasting a Personal Access Token at the PAT prompt caused the raw token characters to appear briefly on a separate terminal line before the masked display rendered. The fix disables readline's built-in character echoing so only the asterisk-masked display is ever visible.

## What's New

- **PAT prompt (`src/services/auth.ts`)**: Changed `createInterface` to use `output: null` instead of `output: process.stderr`, eliminating readline's automatic echo of raw input characters. All terminal output continues to be managed manually via `process.stderr.write`.

## Testing

- **Unit**: Existing unit tests in `tests/unit/auth.test.ts` cover `promptForPat`, `maskedDisplay`, `normalizePat`, `resolvePat`, and `findDotEnvPat` — all pass without modification.
- **Manual**: Verified by pasting a long token at the prompt; only the masked display appears on the prompt line, no raw text.

## Notes

- No breaking changes: CLI flags, config keys, and PAT storage behavior are unchanged.
- No new dependencies added.
