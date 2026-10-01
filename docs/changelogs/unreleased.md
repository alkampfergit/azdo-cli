# Unreleased — targeting 0.22.0

> Working detail for the next release. Finalised into
> `docs/changelogs/0.22.0.md` when the release is cut.

### Added

- `azdo pr status --branch <name>` and `--pr-number <id>` report checks for another branch or a specific pull request without checking it out; same text and `--json` output as the current-branch view. The two are mutually exclusive; an unknown PR exits 3 and a branch with no PRs exits 1, each with a clear message. (#123)
- `azdo pr comments delete <threadId>` (alias `azdo pr comment-delete`) removes a pull request comment through the documented `DELETE .../threads/{threadId}/comments/{commentId}`. `--comment-id <N>` picks the comment and may be omitted only when the thread holds a single one; an ambiguous thread is refused with the candidate ids listed. No confirmation prompt (scripted use); `--dry-run` previews. Exit 3 for an unknown thread or comment, 4 when Azure DevOps refuses because the comment belongs to somebody else. `--json` returns `{ pullRequestId, threadId, commentId, deleted, dryRun }`. (#120)
- `azdo pr list --work-items` returns each pull request's linked work item ids (`workItemIds` in `--json`, a `Work items:` line in text) — one `azdo` call for the whole PR ↔ work item map instead of one per PR. (#122)
- The pull request object in `--json` (`pr list`, `pr status`, `pr open`, `pr comments`) now carries `isDraft`, `creationDate`, `closedDate`, `reviewers` (`uniqueName`, `vote`, `isRequired`) and `labels`; `pr list` marks drafts as `[active, draft]`. (#122)

### Changed

- `azdo config --help` now prints a *Settings* section generated from the settings registry: for every key its meaning, type or accepted values (`credentialStore`: `keyring`, `dpapi` marked Windows only), whether it is global only or also `--org`-scoped, the `AZDO_CREDENTIAL_STORE` override, and a ready-to-paste `azdo config set` example. The credential resolution order stays below it. (#118)
- `azdo config set|get|unset --help` list the keys from the same registry and point at `azdo config --help`. The org-scoped key list is now derived from the registry too, so validation and help cannot disagree. (#118)
