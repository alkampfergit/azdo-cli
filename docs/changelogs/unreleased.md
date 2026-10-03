# Unreleased — targeting 0.22.0

> Working detail for the next release. Finalised into
> `docs/changelogs/0.22.0.md` when the release is cut.

### Added

- `azdo pr status --branch <name>` and `--pr-number <id>` report checks for another branch or a specific pull request without checking it out; same text and `--json` output as the current-branch view. The two are mutually exclusive; an unknown PR exits 3 and a branch with no PRs exits 1, each with a clear message. (#123)
- `azdo pr reviewers list` lists a pull request's reviewers with their votes. `--json` returns, per reviewer, the stable identity (`id`, `uniqueName`) next to the display name, `isRequired`, the raw Azure DevOps `vote` and its named `voteState` (`approved`, `approved-with-suggestions`, `no-vote`, `waiting-for-author`, `rejected`, `bypassed`, or `unknown` for a value the CLI does not know) plus `hasDeclined`. Read-only, **Code (Read)** only; `--pr-number`, `--repo` and the current-branch auto-detection work as on every other `pr` subcommand. The `azdo` counterpart of `gh pr view --json reviews`. (#124)

### Changed

- `azdo config --help` now prints a *Settings* section generated from the settings registry: for every key its meaning, type or accepted values (`credentialStore`: `keyring`, `dpapi` marked Windows only), whether it is global only or also `--org`-scoped, the `AZDO_CREDENTIAL_STORE` override, and a ready-to-paste `azdo config set` example. The credential resolution order stays below it. (#118)
- `azdo config set|get|unset --help` list the keys from the same registry and point at `azdo config --help`. The org-scoped key list is now derived from the registry too, so validation and help cannot disagree. (#118)
