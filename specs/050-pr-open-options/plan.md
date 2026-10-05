# Plan: 050-pr-open-options

`openPullRequest()` takes a trailing `PullRequestOpenOptions` (`src/types/pull-request.ts`) replacing the five hard-coded `develop`s and adding the three create-body fields when requested, so a default call sends the pre-050 body. `createPrOpenCommand()` validates via `resolveOpenOptions()` before any network call, skips the branch lookup when `--source` is given, and adds `id`/`url` to `--json`. No new dependencies.
