# Feature Specification: Settings reference in `azdo config --help`

**Feature Branch**: `feature/046-config-help`
**Created**: 2026-09-30
**Status**: Approved (issue #118, owner: "1. pointer is ok I agree / i do not want a way to query a single setting / go")
**Input**: Issue #118 — "better help for config": the owner wanted to set the
DPAPI credential store and could not find `azdo config set credentialStore dpapi`
from the CLI itself.

## Context

`SETTINGS` in `src/services/config-store.ts` already describes every setting
(key, description, type, example, required), but `azdo config --help` printed
only the credential resolution order, and `config set --help` carried a
hardcoded key list. The allowed values of `credentialStore` (`keyring` |
`dpapi`), the Windows-only restriction and the `AZDO_CREDENTIAL_STORE`
override lived only in `docs/authentication.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover a setting and its values from the CLI (Priority: P1)

An operator runs `azdo config --help` and finds every setting with its
meaning, accepted values, scope, environment override and a paste-ready
example — in particular `azdo config set credentialStore dpapi`.

**Independent Test**: `tests/unit/config-help.test.ts` renders the real help
output and asserts each element per registered key.

**Acceptance Scenarios**:

1. **Given** the CLI, **When** `azdo config --help` runs, **Then** a
   *Settings* section lists every key in `SETTINGS` with its description and
   an `example: azdo config set <key> <example>` line.
2. **Given** the same output, **Then** `credentialStore` lists `keyring` and
   `dpapi`, marks `dpapi` as Windows only, names `AZDO_CREDENTIAL_STORE`, and
   says the setting is global only.
3. **Given** the same output, **Then** the existing credential resolution
   block is still printed, below the settings section.

### User Story 2 - Subcommand help points to the reference (Priority: P2)

`azdo config set --help`, `get --help` and `unset --help` name every key
(from the registry, not a hardcoded string) and tell the user to run
`azdo config --help` for values and scope.

**Independent Test**: the same suite renders each subcommand's help.

## Requirements *(mandatory)*

- **FR-001**: The settings section MUST be rendered from `SETTINGS`; adding a
  key to the registry MUST make it appear without a second edit.
- **FR-002**: For each key the section MUST show: description; type, or the
  closed set of accepted values with per-value notes; scope (global only vs
  also `--org`-scoped); `required` where applicable; environment override
  where one exists; and an `azdo config set` example.
- **FR-003**: `credentialStore`'s accepted values MUST come from
  `CREDENTIAL_STORES`, so the help can never list a value the parser rejects.
- **FR-004**: The org-scoped key set used for validation MUST be derived from
  the same registry field the help renders (`scoped`).
- **FR-005**: `config set|get|unset --help` MUST list the keys from the
  registry and point at `azdo config --help` (owner decision: pointer, not a
  second copy of the section).
- **FR-006**: No behaviour change: every existing `config` command output,
  validation message and exit code is unchanged.
- **FR-007**: `docs/commands.md` MUST carry the settings table and
  `docs/authentication.md` MUST link to it from the DPAPI section.

## Out of Scope

- `azdo config describe <key>` or any per-setting query command (owner
  declined on #118).
- README changes (installation, quick start and command-group table are
  unchanged).

## Success Criteria

- **SC-001**: `npm test && npm run lint` pass, including the new suite.
- **SC-002**: A reader of `azdo config --help` can copy
  `azdo config set credentialStore dpapi` without opening the docs.
