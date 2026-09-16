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
- `azdo pr abandon` (alias `azdo pr close`) and `azdo pr reactivate` end and
  restore a pull request, so an accidentally-opened PR is no longer permanent as
  far as the CLI is concerned. Nothing is deleted and nothing is merged: the PR
  keeps its threads and work-item links, and neither command prompts. Both are
  idempotent (`noop: true`, no write), a completed PR is refused before any
  write, and `reactivate`'s branch lookup searches **abandoned** PRs. (#97)

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
- A permission or not-found failure raised while a `pr` write command was
  *looking up* its target pull request now names the project and repository it
  was working against (`project "my-project"`), instead of reporting
  `project "undefined"`. The context was already resolved at that point; it
  simply was not reachable from the error handler. Affects `pr abandon`,
  `pr reactivate`, `pr update`, `pr comments add|edit|resolve|reopen`,
  `pr reviewers add|remove` and `pr work-items link|unlink`. (#97)
