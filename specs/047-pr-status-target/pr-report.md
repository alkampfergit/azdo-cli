# PR Report: `pr status` for an arbitrary PR or branch

**Branch**: `feature/047-pr-status-target`
**Date**: 2026-10-01
**Spec**: [specs/047-pr-status-target/spec.md](./spec.md)

## Summary

`azdo pr status` gains `--pr-number <id>` and `--branch <name>`, so checks for
another PR or branch can be read without a checkout (replaces
`gh pr view <branch> --json statusCheckRollup`). Same text and `--json` output.

## Behaviour

- `--pr-number <id>`: exactly that PR, any status; `branch` = its source branch. Unknown → exit 3.
- `--branch <name>`: that branch's PRs (`refs/heads/` stripped). No PRs → exit 1.
- Both together, empty branch or a bad number → exit 1, no network call.
- Neither → unchanged (empty result still exit 0).
- Explicit targets never read the local git branch.

## Testing

- 15 new cases in `tests/unit/pr-status.test.ts` (10 standalone + a five-row
  `it.each` over invalid `--pr-number` values, including an unsafe integer).
- Full suite 1422 passed / 129 skipped; `npm run lint` and `tsc --noEmit` clean.

## Notes

- `pr status` still does not carry the single-PR C-1 help sentence or the
  C-2/C-3 zero/multi-match errors (decision A on PR #43).
- `README.md` quick reference gained the two `pr status` targeting lines;
  detail in `docs/commands.md`.
