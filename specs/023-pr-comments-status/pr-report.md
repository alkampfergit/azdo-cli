# PR Report: Better support for commenting in the pull request

**Branch**: `023-pr-comments-status`
**Date**: 2026-06-03
**Spec**: [specs/023-pr-comments-status/spec.md](./spec.md)

## Summary

Improves the `azdo pr status` and `azdo pr comments` commands. Fixes a defect
where `pr status` reported "no checks" even when green branch-policy checks
were running, adds two opt-in filters to `pr comments` for triaging review
feedback, and surfaces open/closed code-comment counts in `pr status`.
Closes #50.

## What's New

- **`pr status` — checks now include branch policy evaluations**: the command
  previously read only the Pull Request *Status API*, which does not return
  branch-policy results (build validation, required reviewers, …) — the green
  checks shown in the Azure DevOps UI. It now also fetches **policy
  evaluations** (resolving the project GUID via the Projects API) and shows the
  merged set. Each check carries a `source` of `status` or `policy` in `--json`.
- **`pr status` — honest empty-vs-error**: `Checks: none reported by Azure
  DevOps` is shown only when both sources are genuinely empty. A retrieval
  failure now shows `Checks: unable to retrieve (…)` instead of silently
  reading as "none", and a check-fetch failure no longer aborts the whole
  command.
- **`pr status` — code-comment counts**: a new `Code comments: N open, M
  closed` line counts only code-anchored (file/line) threads; general
  discussion threads are excluded. Exposed as `codeCommentCounts` in `--json`.
- **`pr comments` — `--code-related-only`**: shows only threads anchored to a
  real file/line.
- **`pr comments` — `--exclude-resolved`**: alias of the existing
  `--hide-resolved`; either flag drops resolved/won't-fix/closed/by-design
  threads. The two filters are independent and combinable; with neither flag,
  output is unchanged.
- **Docs**: `docs/commands.md` and `README.md` updated for the new flags and
  status output.

## Breaking Changes

- **`pr status` no longer exits non-zero when the check lookup fails.**
  Previously a failed checks fetch aborted the command with exit 1. It now
  degrades gracefully: the PR is still listed and the checks line reads
  `unable to retrieve (…)`. This is intentional (FR-002) — a transient checks
  failure should not hide the PR, and "no checks" must never mask an error.

## Testing

- **Unit (vitest)**:
  - `pr-client.test.ts`: policy-evaluation → check mapping with state
    normalisation (approved→succeeded, rejected→failed, running/queued→pending,
    notApplicable/notSet dropped), artifactId construction, and
    `resolveProjectId`; existing status checks now assert `source: 'status'`.
  - `pr-status.test.ts`: merged policy+status checks displayed; empty-vs-error
    (`unable to retrieve`, no abort); open/closed code-comment counts incl.
    general-thread exclusion and the zero case; updated `--json` shape.
  - `pr-comments-filters.test.ts`: `--code-related-only`, `--exclude-resolved`
    (≡ `--hide-resolved`), combination, the no-flag regression, and the
    filtered-to-empty message.
- **Gate**: `npm run lint` clean, `npx tsc --noEmit` clean, `npm test` =
  768 passed / 7 pre-existing skips, `npm run build` clean.

## Notes

- `npm run format` (prettier `--check`) reports pre-existing style warnings
  across ~41 unrelated `src/` files; the repo baseline is not prettier-clean
  and `format` is not part of the lint/test/build gate, so no unrelated
  reformatting was done.
- The live `quickstart.md` spot-check requires a real Azure DevOps PR with a
  green build-validation policy; it is provided for manual verification and was
  not run in CI (no live ADO credentials in the test environment).
