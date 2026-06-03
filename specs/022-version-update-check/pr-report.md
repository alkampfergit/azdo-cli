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

<!-- finalised in step 11 -->

- **[placeholder]**

## Testing

<!-- finalised in step 11 -->

- **[placeholder]**
