# PR Report: Explicit install command in the update notice

**Branch**: `feature/042-update-notice-command`
**Date**: 2026-09-28
**Spec**: [specs/042-update-notice-command/spec.md](./spec.md)

## Summary

The update notice printed `npm i -g azdo-cli`. It now prints
`npm install -g azdo-cli@latest`, which is the same long form the README uses
and names the `latest` tag explicitly. Only the wording changes: the old
command already worked, and nothing else about the notice is different.

## What's New

- **`src/services/update-check.ts`**: the notice string in `getUpdateNotice()`.
- **`docs/commands.md`**: the sample line in *Update notifications*.
- **`docs/changelogs/unreleased.md`**: *Changed* entry.

## Testing

- **Unit**: `tests/unit/update-check.test.ts` C4 now asserts the full
  ``Run `npm install -g azdo-cli@latest` to update.`` clause and the absence of
  `npm i -g`. Checked that it fails with the old string and passes with the new
  one. Full suite: 1216 passed / 128 skipped; lint 0 errors (the 2 warnings in
  `audit-log.test.ts` were already there).

## Notes

- Detecting pnpm/yarn/bun is left out of scope, as agreed on #108.
- `docs/changelogs/unreleased.md` and `CHANGELOG.md` still say
  "Targeting 0.19.0", but `master` is tagged `0.19.0`. The 0.19.0 release
  looks like it was cut without running `/changelog release`. That is not
  fixed here.
