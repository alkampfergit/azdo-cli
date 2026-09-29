# PR Report: SonarCloud clean sweep

**Branch**: `feature/041-sonarcloud-cleanup`
**Date**: 2026-09-18
**Spec**: [specs/041-sonarcloud-cleanup/spec.md](./spec.md)

## Summary

Clears 28 of the 35 OPEN/CONFIRMED SonarCloud findings on `develop` (0 bugs, 7
devcontainer/shell hardening findings, 21 code smells) with source changes only
— no rule suppressions, no *Won't fix* markings, no `// NOSONAR`. The other 7
live in `.github/workflows/ci.yml`; that fix is written and verified but could
not be pushed from here — see **Notes**. Three of them are
real refactors of shipped command code whose cognitive complexity was over the
limit (46 / 18 / 17); the other 32 are small, local edits. No CLI surface, no
dependency and no command output changes.

## What's New

- **`src/commands/pr.ts` — the `pr comments` action (complexity 46 → ~12)**:
  split into `parseCommentsOptions`, `resolveCommentsPullRequest`,
  `selectCommentThreads`, `shapeCommentThreads` and `describeEmptyThreads`.
  Every message string and exit code is carried over verbatim; the action keeps
  only the sequencing and the `try`/`catch`. Follows the precedent set by 038
  and 039, which split their actions for the same rule.
- **`src/commands/auth.ts` — `handleLogout` (18 → ~3)**: split on the branch it
  already had, into `logoutAllOrgs` and `logoutSingleOrg`. Exit codes 1 / 3 / 4
  unchanged.
- **`src/services/auth.ts` — `findDotEnvPat` (17 → ~5)**: reading one `.env`
  moved into `patFromEnvFile`, so the walk-up loop is just a walk-up. The
  nesting (`while` → `if exists` → `for line` → `if match` → `if non-empty`)
  was the entire score.
- **`.github/workflows/ci.yml` (as a patch file, not applied)**:
  `npm ci --ignore-scripts` on all three install steps; `npx vitest` →
  `npm exec --no -- vitest`, which uses the version already pinned in
  `package-lock.json` instead of letting `npx` resolve (and possibly fetch)
  one. Shipped as `specs/041-sonarcloud-cleanup/ci-workflow.patch` — see
  **Notes**.
- **`.devcontainer/postcreate.sh`**: `--proto '=https' --tlsv1.2` on the five
  `curl` installs, `--ignore-scripts` on the global `@openai/codex` install
  (matching the `automata-cli` line next to it), and `--no-build` on the
  spec-kit install — see **Breaking Changes**.
- **`scripts/compute-version.sh`**: `[` → `[[` on five conditionals. Verified
  by running the script for `develop`, `release/*` and a feature branch: same
  version and tag as before.
- **`.specify/scripts/bash/update-agent-context.sh`**: the repeated
  `NEEDS CLARIFICATION` literal becomes a `readonly` constant; an unused local
  is removed. Vendored, so the next spec-kit upgrade will reintroduce both.
- **Tests**: `trace-writer.test.ts` gains the assertion it was missing (it
  asserted nothing at all); `auth.test.ts` uses `toHaveLength`; two families in
  `git-remote.test.ts` and five round-trip cases in `md-generic-types.test.ts`
  become `it.each` tables with every input and expectation preserved;
  `auth.integration.test.ts` declares its case with a literal `it(...)` under
  `describe.skipIf(!INTEGRATION_ENABLED)` instead of through an aliased
  `it`/`it.skip`, so the test is visible to vitest's filtering and to static
  analysis alike.

## New Libraries / Dependencies

None.

## Breaking Changes

- **Devcontainer: spec-kit now installs from PyPI, not from `main`.**
  SonarCloud's S8541 wants `--no-build` on `uv tool install`, and `--no-build`
  is *incompatible* with `--from git+https://github.com/github/spec-kit.git` —
  a git source has no wheel, so uv refuses:
  `error: Building source distributions is disabled, but attempted to build specify-cli`.
  The only way to satisfy the rule is to install something that ships a wheel.
  `specify-cli` is on PyPI (1.0.8) and is the same project — the devcontainer
  currently lands on `1.0.8.dev0` built from `main`, the pre-release of that
  version — so the line becomes `uv tool install specify-cli --no-build`.
  This affects the dev environment only (nothing shipped), but it does mean
  spec-kit follows PyPI releases instead of `main`. **If you want `main`, say
  so and I will revert this hunk and leave S8541 open** rather than pretend it
  can be fixed in place.

## Testing

- **Unit + integration (`npm test`)**: 70 files passed / 12 skipped, 1216 tests
  passed / 128 skipped. No test removed; the two parameterised tables execute
  the same 15 and 5 cases as the blocks they replaced.
- **Lint (`npm run lint`)**: 0 errors. The 2 warnings in `audit-log.test.ts`
  predate this branch and are not among the 35.
- **Typecheck (`npm run typecheck`)**: clean.
- **Manual**: `scripts/compute-version.sh` run for `develop`, `release/0.14.0`
  and a feature branch — identical output to before the `[[` change.
- **Empirical**: the `--no-build` incompatibility above was reproduced in a
  throwaway venv rather than reasoned about.

## Notes

- **7 findings are not fixed by this PR, and it is a permissions problem, not a
  technical one.** The workflow change is written and reviewed, but the token
  this branch was pushed with holds `gist, read:org, repo` and not `workflow`,
  so GitHub rejected the push outright:
  `refusing to allow an OAuth App to create or update workflow .github/workflows/ci.yml without workflow scope`.
  Rather than drop it, the diff ships as
  `specs/041-sonarcloud-cleanup/ci-workflow.patch`. Apply with
  `git apply specs/041-sonarcloud-cleanup/ci-workflow.patch` from anyone with
  `workflow` scope. Until then the gate on `develop` goes 35 → 7, not 35 → 0,
  so this PR does **not** auto-close issue #104: the remaining work is tracked
  in issue #106, which carries the rule list, the apply steps and the
  revert-if-red note below.
- **Watch CI once that patch is applied.** `npm ci --ignore-scripts` is the one
  change that can plausibly break a green pipeline: `@napi-rs/keyring` is
  native. Its prebuilds ship as optional platform packages rather than via a
  `postinstall` build, so it should be unaffected — but the credential-store
  integration suite is the proof, and it has not run against this change yet.
  If that job goes red, revert the three `npm ci` hunks; a green pipeline
  outranks three hygiene findings.
- **`.specify/` is vendored.** Its two findings are fixed in place and will
  come back on the next spec-kit upgrade. The durable alternative — excluding
  the tree in SonarCloud's project settings — is a settings change, not a
  repository change, and was left for the owner.
- SonarCloud re-analysis of `develop` after merge is the real acceptance test
  for SC-001 (35 → 0); the PR's own analysis covers SC-004 (no new findings).
