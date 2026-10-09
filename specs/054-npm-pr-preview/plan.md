# Plan
1. `scripts/compute-version.sh`: add `--pr <n> [run]` (tag `pr-<n>`, exit 2 on non-numeric).
2. `.github/workflows/ci.yml`: `pr` input; `build` packs and uploads `preview-tarball` on `pull_request`; `prepare` and `publish-preview` jobs publish it; `build`/`integration-tests` skipped on a preview run; explicit `contents: read`.
3. `.github/workflows/npm-tag-cleanup.yml`: weekly cleanup using `NPM_TOKEN`.
4. `tests/unit/compute-version.test.ts`: fixture-tag test for `--pr` and the existing modes.
5. `docs/development.md`, `docs/changelogs/unreleased.md`.

Setup outside the repo: `NPM_TOKEN` secret (granular, this package only); the cleanup schedule fires only once merged to the default branch.
