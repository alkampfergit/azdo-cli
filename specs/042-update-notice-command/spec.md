# Feature Specification: Explicit install command in the update notice

**Feature Branch**: `feature/042-update-notice-command`
**Created**: 2026-09-28
**Status**: Approved (issue #108, owner "ok I agree go on")
**Input**: Issue #108 — "Message for update is not correct": the update notice
prints `npm i -g azdo-cli`; the owner asked for `npm install azdo-cli@latest -g`.

## Context

`getUpdateNotice()` in `src/services/update-check.ts` is the single source of
the line printed to stderr when a newer stable release exists:

```
A new version of azdo-cli is available: 0.18.0 → 0.19.0. Run `npm i -g azdo-cli` to update.
```

`npm i` is npm's documented, non-deprecated alias for `install`, and an
unversioned global install resolves the `latest` dist-tag, so the printed
command works. It is still worth changing because:

1. `@latest` states the intent explicitly and does not depend on a local
   `.npmrc` default tag or on how the package was first installed.
2. `README.md` spells the install as `npm install -g azdo-cli`; the notice
   should use the same long form.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The notice tells me the explicit upgrade command (Priority: P1)

An operator sees the update notice and copies the command from it.

**Independent Test**: `tests/unit/update-check.test.ts` (C4) asserts the
notice text.

**Acceptance Scenarios**:

1. **Given** a newer stable release on npm, **When** any command runs and the
   throttle window has passed, **Then** stderr carries
   `A new version of azdo-cli is available: <cur> → <latest>. Run \`npm install -g azdo-cli@latest\` to update.`
2. **Given** the same condition, **Then** the notice no longer contains
   `npm i -g`.

## Requirements *(mandatory)*

- **FR-001**: The notice MUST recommend `npm install -g azdo-cli@latest`
  (long-form `install`, flag before the package, explicit `@latest` tag).
- **FR-002**: The rest of the notice (versions, arrow, sentence shape, stderr
  destination, throttle, opt-outs) MUST be unchanged.
- **FR-003**: `docs/commands.md` *Update notifications* MUST show the new line.

## Out of Scope

- Detecting pnpm / yarn / bun installs and printing the matching command — a
  real behaviour change with its own edge cases; to be tracked as a separate
  issue if wanted (agreed on #108).

## Success Criteria

- **SC-001**: `npm test && npm run lint` pass with the updated assertion.
- **SC-002**: No other code path, dependency or command output changes.
