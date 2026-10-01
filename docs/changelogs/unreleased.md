# Unreleased — targeting 0.22.0

> Working detail for the next release. Finalised into
> `docs/changelogs/0.22.0.md` when the release is cut.

### Added

- `azdo pr list --work-items` returns each pull request's linked work item ids (`workItemIds` in `--json`, a `Work items:` line in text) — one `azdo` call for the whole PR ↔ work item map instead of one per PR. (#122)
- The pull request object in `--json` (`pr list`, `pr status`, `pr open`, `pr comments`) now carries `isDraft`, `creationDate`, `closedDate`, `reviewers` (`uniqueName`, `vote`, `isRequired`) and `labels`; `pr list` marks drafts as `[active, draft]`. (#122)

### Changed

- `azdo config --help` now prints a *Settings* section generated from the settings registry: for every key its meaning, type or accepted values (`credentialStore`: `keyring`, `dpapi` marked Windows only), whether it is global only or also `--org`-scoped, the `AZDO_CREDENTIAL_STORE` override, and a ready-to-paste `azdo config set` example. The credential resolution order stays below it. (#118)
- `azdo config set|get|unset --help` list the keys from the same registry and point at `azdo config --help`. The org-scoped key list is now derived from the registry too, so validation and help cannot disagree. (#118)
