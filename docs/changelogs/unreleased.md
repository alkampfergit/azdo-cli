# Unreleased — targeting 0.19.0

> Working detail for the next release. The `changelog` skill renames this file
> to `docs/changelogs/0.19.0.md` when the release is cut. Only keep categories
> that have entries.

### Added

- `azdo pr update` (alias `azdo pr edit`) changes an existing pull request's
  title and/or description — the counterpart to `pr open`, which could only
  create. Only the fields you pass are sent, so `--title` provably cannot
  disturb the description; `--description` **replaces** the description
  literally (no repository template is prepended, unlike `pr open`, which would
  otherwise re-prepend it on every edit). Re-running with values that already
  match is a no-op with no write (`noop: true` in `--json`). (#96)
- `--description-file <path>` on `azdo pr open`, plus `--title-file` /
  `--description-file` on `azdo pr update`. A path of `-` reads standard input,
  which also now works for `azdo pr comments add|edit|reply --file -`. (#96)

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
