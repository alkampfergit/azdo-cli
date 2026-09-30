# Feature Specification: Complete command reference and Context7 index

**Feature Branch**: `feature/045-command-reference-docs`
**Created**: 2026-09-30
**Status**: Implemented
**Input**: GitHub issue #116 (raised from alkampfergit/automata-cli#89)

## Context

While mapping `gh` usage onto azdo-cli 0.20.0, the Context7 index
(https://context7.com/alkampfergit/azdo-cli) turned out to be missing most
`pr` / `relations` / attachment commands and every `--json` shape, and it
returned examples for commands that no longer exist (`azdo login`,
`azdo work-item get`, `azdo boards get-item`). Context7 indexes the whole
repository, so the ~45 `specs/` folders (planning history, including removed
commands) weigh as much as the actual reference.

`docs/commands.md` already existed but had drifted: no attachment or `relations`
section, cheat-sheet rows missing `pr list|abandon|reactivate|work-items|reviewers`,
`pipeline tests`, `--commit` / `--pr`, and the JSON output list stopped at a
one-line enumeration.

## User Scenarios

### US-1 — One page lists every command (P1)
A human or agent reading `docs/commands.md` (directly or through Context7) finds
every subcommand and alias that `azdo --help` knows, with its options.

### US-2 — JSON contracts are documented (P1)
A consumer parsing `--json` (automata) finds the shape of each command's output
— in particular `pr list`, `pr status`, `pr comments`, `comments list|add`,
`auth diagnose` (`identity`) and `auth status` — without reading the source.

### US-3 — The index shows no removed commands (P2)
Context7 stops returning `azdo login`, `azdo work-item get`, `azdo boards …`.

### US-4 — The reference cannot drift again (P2)
Adding a command, alias or option without documenting it fails the test suite.

## Requirements

- **FR-001** `docs/commands.md` MUST mention every command path and alias of the
  real command tree and every long option any command declares.
- **FR-002** `docs/commands.md` MUST document the `--json` output shape of every
  command that has `--json`, and list the commands that do not.
- **FR-003** `docs/commands.md` MUST document: the attachment commands, the
  `relations` group (including that `relations list` omits `ArtifactLink` /
  `Hyperlink` / `AttachedFile`), the credential resolution order and the ignored
  env vars, `credentialStore`, that `pr open` always targets `develop`, and that
  `azdo login` does not exist.
- **FR-004** A unit test MUST walk `createProgram()` and fail when FR-001 is not
  met, and when a removed command (`azdo login`, `azdo work-item`, `azdo boards`)
  appears in the reference other than to say it does not exist.
- **FR-005** A root `context7.json` MUST exclude `specs/`, tooling and source
  folders from the Context7 index and carry rules pointing at `docs/commands.md`.

### Corrections to the issue text (verified against the source)

- `azdo auth status --json` carries **no** `identity` object; only
  `auth diagnose --json` does. Both shapes are documented as they are.
- `relations types` lists only enabled `workItemLink` types.

## Out of Scope

- Generating `docs/commands.md` from `--help` (a check is enough, and hand-written
  prose carries the semantics `--help` does not).
- Triggering the Context7 re-index — done by the maintainer on context7.com
  after merge.
- Any change to command behaviour or output.

## Success Criteria

- **SC-001** `tests/unit/docs-command-reference.test.ts` passes on the new page and
  fails on the 0.20.0 page (12 failures: attachments, `relations`, `--comment`,
  `--id`, `--output`, `--yes`).
- **SC-002** `npm test && npm run lint` green.
