# Unreleased — targeting 0.19.0

> Working detail for the next release. The `changelog` skill renames this file
> to `docs/changelogs/0.19.0.md` when the release is cut. Only keep categories
> that have entries.

### Added

### Changed

- Every failed Azure DevOps request now prints the server's own explanation
  (`message`, plus `typeKey` / `errorCode` when present) under the CLI's curated
  guidance, instead of only a status code. Applies to every command group; the
  detail is redacted, capped at 500 characters, and never echoes the Entra
  sign-in page. Redaction now also covers token-shaped runs inside free text, so
  a `text/plain` error body cannot leak a PAT the way `redactBody` — which only
  understands JSON fields — allowed. The curated `Request rejected:` messages
  carry the same `typeKey` / `errorCode` suffix as every other failure. (#95)

### Fixed

- `azdo pr open` now measures the **composed** description — your
  `--description` plus the repository pull request template — against Azure
  DevOps' 4000-character limit and fails before the create call, naming every
  contribution and the exact reduction needed. Previously the template pushed
  the description over the cap silently and the request came back as an opaque
  `HTTP_400` with no pull request created. (#95)
