# Unreleased — targeting 0.17.0

> Working detail for the next release. The `changelog` skill renames this file
> to `docs/changelogs/0.17.0.md` when the release is cut. Only keep categories
> that have entries.

### Added

### Changed

### Fixed

- **`azdo pr work-items link` malformed ArtifactLink URI** — `buildWorkItemArtifactUri` joined
  the project id, repository id, and PR id with literal `/` instead of Azure DevOps' canonical
  percent-encoded `%2F` separator, so the CLI reported success but the linked work item never
  appeared in the PR's "Work Items" panel (or the work item's "Development" section). The URI
  builder now percent-encodes each segment and joins with `%2F`; `link`/`unlink`/already-linked
  matching all stay consistent against the corrected URI (#84).
