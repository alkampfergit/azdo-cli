# Unreleased — targeting 0.18.0

> Working detail for the next release. The `changelog` skill renames this file
> to `docs/changelogs/0.18.0.md` when the release is cut. Only keep categories
> that have entries.

### Added

- **`azdo add-attachment` / `azdo delete-attachment`** — upload a local file to a work item
  (with an optional comment, always adding a new attachment rather than replacing one that
  shares its filename) and remove a named attachment (interactive confirm, `--yes` to skip,
  `--id <guid>` to disambiguate when more than one attachment shares a filename). Both follow
  the existing `download-attachment` command's flat surface (036-workitem-attachment-crud,
  #87/#88).
