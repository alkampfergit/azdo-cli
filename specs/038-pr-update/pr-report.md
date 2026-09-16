# PR Report: `azdo pr update` and `--description-file` on `pr open`

**Branch**: `feature/038-pr-update`
**Date**: 2026-09-16
**Spec**: [specs/038-pr-update/spec.md](./spec.md)

## Summary

A pull request's title and description were the only write-once fields in the
CLI: `pr open` could create them, nothing could correct them, and re-running
`pr open` on an existing PR returned `created: false` and changed nothing. This
adds `azdo pr update` (alias `azdo pr edit`), mapping to the documented
`PATCH .../pullrequests/{id}`, plus file/stdin input for descriptions on both
`pr open` and `pr update`.

## What's New

- **`src/services/pr-client.ts` — `updatePullRequest()`**: `PATCH
  .../pullrequests/{id}?api-version=7.1` sending a **partial** body. Azure
  DevOps documents a closed set of updatable properties and warns that anything
  outside it either throws `InvalidArgumentValueException` or is silently
  ignored, so the fetched pull request is never echoed back — only the supplied
  keys are sent. That is also what makes "`--title` cannot disturb the
  description" a property of the transport rather than a convention. The
  4000-character cap is enforced before the request.
- **`src/commands/pr.ts` — `azdo pr update`**: `--title` / `--title-file`,
  `--description` / `--description-file`, each pair mutually exclusive, at least
  one required. Reuses `resolvePullRequestTarget`, so `--pr-number`, the
  current-branch fallback, the zero-/multi-match contract messages and the
  group's exit codes (1 / 3 / 4) all come for free.
- **No-op detection**: the target resolver already fetched the pull request and
  `mapPullRequest` already projects `title` and `description` onto it, so
  comparing costs zero extra round trips. When every supplied field matches,
  nothing is sent and `--json` reports `noop: true` with an empty
  `updatedFields` — the same convention as `pr work-items link` and
  `pr reviewers add`.
- **Literal description replacement**: `pr update --description` does **not**
  resolve or prepend the repository pull request template, unlike `pr open`.
  Prepending on update would re-prepend on every subsequent edit. The rule is in
  the flag's own `--help` text, not just the docs.
- **`--description-file` on `pr open`**, and `--title-file` /
  `--description-file` on `pr update`. A path of `-` means standard input, and
  that support was added **inside** the existing `resolveCommentBody` reader
  rather than as a second one — so `pr comments add|edit|reply --file -` now
  works too, where it previously failed with `File not found: -`.
- **`docs/commands.md`**: cheat-sheet row and examples, a full `azdo pr update`
  block, the `--description-file` note on `pr open`, and the stdin note on the
  comment commands.

## New Libraries / Dependencies

None.

## Breaking Changes

None. Two deliberate non-changes worth flagging to a reviewer:

- `pr open --description ''` still means "no description supplied — use the
  repository template", as it always has. An empty `--description-file` **is**
  rejected: reading a body out of a file that has none is a mistake, not a
  fallback.
- `pr comments add|edit|reply --file -` changes meaning, from "file not found"
  to "read stdin". Nothing could have depended on the old behaviour, since it
  was an unconditional error.

## Testing

- **Unit (`tests/unit/pr-update.test.ts`, new, 25 cases)**: every validation
  message, both mutual-exclusion pairs, empty values, missing file, stdin
  (including the double-`-` rejection and a read failure), partial patch for
  each field and both, the "supplied but unchanged field is omitted" case, no-op
  human + JSON output, the JSON shape, exit 3 on a missing PR, exit 4 on
  permission denial, over-length as a validation failure, and both branch
  resolution contract messages.
- **Unit (`tests/unit/pr-client.test.ts`)**: the PATCH URL and method, the
  partial payload for one field and for both, the absence of any template
  lookup, and the pre-flight rejection that issues no request at all.
- **Unit (`tests/unit/pr-open.test.ts`)**: `--description-file`, its mutual
  exclusion with `--description`, missing and empty files, and a regression case
  pinning that an empty inline `--description` still falls back to the template.
- **Unit (`tests/unit/pr-command-tree.test.ts`)**: `azdo pr update` and
  `azdo pr edit` driven through the real `azdo pr` tree, covering `--pr-number`,
  `--repo`, `--json` and the branch fallback — the suite that exists because
  isolated command factories cannot see commander option-plumbing bugs.
- **Gate**: `npm test && npm run lint` — 1148 passed, 128 skipped, 0 lint
  errors.

## Notes

- Status changes (`pr abandon` / `--reactivate`) ride the same `PATCH` but are
  deliberately out of scope — issue #97.
- Clearing a description (setting it to empty) is rejected, not supported. If
  that turns out to be wanted, it needs an explicit flag rather than an
  overloaded empty value.
- `README.md` is updated per Constitution VII: the `pr` feature bullet now names
  `pr update`, a new bullet covers `--title-file` / `--description-file` /
  `--file` and `-` for standard input, and the quick-start gained an
  `azdo pr update` block plus the piped `--file -` / `--description-file` lines.
