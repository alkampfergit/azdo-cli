# Unreleased — targeting 0.16.0

> Working detail for the next release. The `changelog` skill renames this file
> to `docs/changelogs/0.16.0.md` when the release is cut. Only keep categories
> that have entries.

### Added

- **`azdo pr work-items link|unlink <id>`** — link or unlink a work item to/from a pull request (#82, #83)
- **`azdo pr reviewers add|remove <reviewer>`** — add a reviewer as required (`--required`) or optional, or remove one (#82, #83)
- **`azdo pr open` template support** — when `--description` is omitted, uses a repository-defined pull request template (Azure DevOps's `pull_request_template[/branches/<branch>].md` convention) if one exists; if both are present, the supplied text is followed by the template content (#82, #83)

### Changed

### Fixed

- **`resolveCredentialIdentity` (`azdo auth diagnose`)** — the `connectionData` call used `api-version=7.1` instead of the required `api-version=7.1-preview`, so it always 400'd and silently resolved to `null`; `azdo auth diagnose --json` always reported `identity: null` regardless of credential validity. Found while adding a reviewer integration test that needed the authenticated identity (#82, #83)
