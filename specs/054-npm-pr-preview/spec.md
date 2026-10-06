# Spec: Publish a preview of a pull request to npm

Issue: #140

## Goal
`npm i -g azdo-cli@pr-<number>` installs the code of a pull request, without cloning, building or linking.

## Requirements
- `ci.yml` `workflow_dispatch` gains an optional `pr` input. Without it, every trigger behaves as before and nothing is published.
- With `pr`: the number must be numeric, the PR open, and the PR's head commit must have a successful `pull_request` CI run (else the run stops). That run's lint, typecheck, build and tests are the gate, and its packed tarball is what gets published under dist-tag `pr-<number>`. `latest` is untouched.
- Version is derived from git tags, like `develop`: `<next-minor>-pr.<number>.<run>` (e.g. `0.22.0-pr.134.57`). `scripts/compute-version.sh --pr <n> [run]` owns the rule; `package.json` is not read.
- `npm-tag-cleanup.yml` runs weekly and on demand, and removes `pr-<n>` dist-tags whose PR is `CLOSED` or `MERGED`. Open PRs and failed lookups keep their tag. Versions stay on npm.
- The `publish` and `release` jobs are unchanged.

## Decisions (from the issue discussion)
- No PR code in the manual run (revised after CodeQL `actions/cache-poisoning/poisonable-step`): a `workflow_dispatch` run executes in the default branch's cache scope, so building PR code there could poison that cache. The unprivileged `pull_request` run packs the tarball and uploads it; the manual run skips `build`/`integration-tests` and only re-versions and publishes that artifact.
- A trusted `prepare` job (dispatched ref only) validates the PR, finds the successful `pull_request` run of its head SHA (so tested == published) and runs the version script from the trusted ref, validating the result against `^X.Y.Z-pr.N.R$`.
- `publish-preview` (`id-token: write`, `actions: read`) accepts only plain files and directories under `package/`, rewrites the version and drops `publishConfig` with node, re-packs with tar and publishes with `--ignore-scripts` and a pinned registry.
- No PR comment: the install command is written to the job summary, so no `pull-requests: write` is granted.

## Out of scope
Automatic publish per push, removing old versions, changes to `publish`/`release`.
