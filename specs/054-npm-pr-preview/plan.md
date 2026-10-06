# Plan
1. `scripts/compute-version.sh`: add `--pr <n> [run]` (tag `pr-<n>`, exit 2 on non-numeric).
2. `.github/workflows/ci.yml`: `pr` input; `prepare`, `package-preview`, `publish-preview` jobs; `ref` pinned in `build`/`integration-tests`; explicit `contents: read`.
3. `.github/workflows/npm-tag-cleanup.yml`: weekly cleanup using `NPM_TOKEN`.
4. `tests/unit/compute-version.test.ts`: fixture-tag test for `--pr` and the existing modes.
5. `docs/development.md`, `docs/changelogs/unreleased.md`.

Setup outside the repo: `NPM_TOKEN` secret (granular, this package only); the cleanup schedule fires only once merged to the default branch.
