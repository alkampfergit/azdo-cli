# Spec: Publish a preview of a pull request to npm

Issue: #140

## Goal
`npm i -g azdo-cli@pr-<number>` installs the code of a pull request, without cloning, building or linking.

## Requirements
- `ci.yml` `workflow_dispatch` gains an optional `pr` input. Without it, every trigger behaves as before and nothing is published.
- With `pr`: the number must be numeric and the PR open (else the run stops); lint, typecheck, build, unit and integration tests run on the PR head; only if all pass is a preview published under dist-tag `pr-<number>`. `latest` is untouched.
- Version is derived from git tags, like `develop`: `<next-minor>-pr.<number>.<run>` (e.g. `0.22.0-pr.134.57`). `scripts/compute-version.sh --pr <n> [run]` owns the rule; `package.json` is not read.
- `npm-tag-cleanup.yml` runs weekly and on demand, and removes `pr-<n>` dist-tags whose PR is `CLOSED` or `MERGED`. Open PRs and failed lookups keep their tag. Versions stay on npm.
- The `publish` and `release` jobs are unchanged.

## Decisions (from the issue discussion)
- Security split: the job holding `id-token: write` (`publish-preview`) executes no PR code. `package-preview` (no id-token) builds and packs the tarball; `publish-preview` verifies name/version and publishes it.
- A trusted `prepare` job (dispatched ref only) validates the PR, pins the head SHA for all jobs (so tested == published) and runs the version script from the trusted ref, validating the result against `^X.Y.Z-pr.N.R$`.
- No PR comment: the install command is written to the job summary, so no `pull-requests: write` is granted.

## Out of scope
Automatic publish per push, removing old versions, changes to `publish`/`release`.
