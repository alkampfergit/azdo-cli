# PR Report: Fix `azdo pr` errors on valid Azure DevOps remotes

**Branch**: `019-fix-pr-command`
**Date**: 2026-05-29
**Spec**: [specs/019-fix-pr-command/spec.md](./spec.md)

## Summary

`azdo pr <sub>` aborted with *"Git remote 'origin' is not an Azure DevOps URL"* on any remote whose URL carries a `<user>@` (or `<user>:<token>@`) userinfo prefix — the exact form Azure DevOps's own "Clone" instructions produce — and also rejected a trailing `.git` suffix. **User Story 1** extends the URL recognition layer to tolerate both, without widening the host allow-list, and emits a one-time per-session stderr warning when an embedded credential is detected (never echoing it). **User Story 2** documents the branch→PR auto-detection rule in the `--help` of the single-PR commands and replaces their ad-hoc zero/multi-match errors with the contract strings (C-2/C-3). Per owner decision **A** on this PR, `pr status` stays a multi-PR list/overview command and is intentionally excluded from US2's help/error changes — the single-PR scope is `pr comments`, `pr comment-resolve`, and `pr comment-reopen`.

## What's New

- **Userinfo-prefixed HTTPS remotes are recognised.** `parseAzdoRemote()` / `parseRepoName()` in `src/services/git-remote.ts` now absorb an optional `(?:[^@/]+@)?` userinfo prefix (`<user>@` or `<user>:<token>@`) on every HTTPS form, plus an optional trailing `.git`. The host literals are unchanged, so the allow-list is **not** widened — `dev.azure.com.evil.example` and `ftp://…` are still rejected.
- **One-time credential warning.** New `src/services/remote-warning.ts` emits a single process-scoped stderr line when a parsed HTTPS remote carries embedded credentials. The string is a constant — no part of the user/token segment is ever interpolated — and the write is now wrapped so it can never throw or alter the exit code (FR-004a).
- **Frozen regression baseline.** `tests/unit/fixtures/git-remote.cases.ts` pins the pre-change parse outputs so the FR-007 byte-identical guarantee for non-userinfo, non-`.git` URLs is enforced by test.
- **US2 — `--pr-number` help text (C-1).** A single shared `PR_NUMBER_HELP` constant in `src/commands/pr.ts` documents how the active PR is auto-detected when `--pr-number` is omitted, applied to `pr comments` / `comment-resolve` / `comment-reopen` so the wording cannot drift.
- **US2 — zero/multi-match errors (C-2/C-3).** Those three commands now emit the exact contract lines on stderr (exit 1, empty stdout, no interactive prompt even under a TTY) when branch auto-detection matches zero or ≥2 open PRs; multi-match lists the PR numbers `#`-prefixed in Azure DevOps API order without re-sorting. `pr status` is unchanged (decision A). `src/services/pr-client.ts::listPullRequests()` already returns the full candidate set, so no client change was needed.

## Testing

- `npm test` — vitest unit + integration suites green (697 passed / 7 skipped). Covers the new C-4 warning contract, the C-5/C-6 userinfo+`.git` recognition matrix, the C-7 frozen-parity block, and the new `tests/unit/pr.test.ts` asserting C-1 (help substring on the three single-PR commands, and its absence on `pr status`), C-2, and C-3 verbatim.
- `npm run lint` — eslint clean.
- Build (`tsup`) and `tsc` type-check pass.
- Addressed both Copilot review comments on this PR: wrapped the credential-warning `stderr.write` in try/catch (FR-004a), and corrected this report so it describes only what the diff delivers.
