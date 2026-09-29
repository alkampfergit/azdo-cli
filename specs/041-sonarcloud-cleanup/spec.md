# Feature Specification: SonarCloud clean sweep (develop, OPEN + CONFIRMED)

**Feature Branch**: `feature/041-sonarcloud-cleanup`
**Created**: 2026-09-18
**Status**: Draft
**Input**: Issue #104 — "Fix all issue of sonarcloud", linking the SonarCloud
issue list for `alkampfergit_azdo-cli` on branch `develop`, filtered to
`OPEN, CONFIRMED` over the new-code period.

## Context

`GET /api/issues/search?componentKeys=alkampfergit_azdo-cli&branch=develop&issueStatuses=OPEN,CONFIRMED`
returns **35 issues** (0 bugs, 14 security-hotspot-style findings on CI and
devcontainer scripts, 21 code smells). The new-code period covers all 35, so
the quality gate on `develop` is carrying every one of them.

This is a hygiene feature: it changes no CLI surface, adds no dependency, and
must not alter any observable command behaviour. Its value is that the next
feature PR starts from a clean gate, so a genuinely new smell is visible
instead of being buried in a standing backlog of 35.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The quality gate reports only new problems (Priority: P1)

A maintainer opening a PR against `develop` wants the SonarCloud check to
speak only about the code that PR touched. Today the gate is noisy with 35
pre-existing findings, so the signal is ignored by habit.

**Why this priority**: This is the whole point of the issue. Everything else
is a means to it.

**Independent Test**: Re-run the same SonarCloud API query after the merge and
confirm the OPEN+CONFIRMED count for `develop` is 0.

**Acceptance Scenarios**:

1. **Given** the 35 findings on `develop`, **When** this feature merges,
   **Then** the same query returns 0 issues.
2. **Given** each individual fix, **When** `npm test && npm run lint` runs,
   **Then** every existing test still passes unchanged — no test is deleted
   or weakened to silence a rule.

---

### User Story 2 - Command behaviour is byte-identical (Priority: P1)

An operator running `azdo pr comments`, `azdo auth logout`, `azdo relations`,
`azdo list-fields` sees exactly the same stdout, stderr and exit codes before
and after this change.

**Why this priority**: The three cognitive-complexity refactors touch shipped
command code. A refactor that changes a message or an exit code is a
regression shipped under a "cleanup" label — the worst kind.

**Independent Test**: The existing unit and command-tree suites already pin
those strings and exit codes; they must pass untouched.

**Acceptance Scenarios**:

1. **Given** `pr comments` with any combination of `--thread`, `--contains`,
   `--max-chars`, `--exclude-system`, `--hide-resolved`, `--code-related-only`
   and `--json`, **When** the refactored action runs, **Then** output matches
   the pre-refactor output exactly.
2. **Given** `azdo auth logout --all` and `azdo auth logout --org X`,
   **When** the refactored handler runs, **Then** messages and exit codes
   (1 / 3 / 4) are unchanged.
3. **Given** a `.env` walked up from a nested directory, **When**
   `findDotEnvPat` runs, **Then** the same PAT is found from the same
   directory in the same precedence order.

---

### User Story 3 - CI installs stay reproducible (Priority: P2)

The CI workflow should not install packages on demand at an unpinned version,
and should not run third-party lifecycle scripts it does not need.

**Why this priority**: Real (if small) supply-chain hardening, and it is what
five of the seven workflow findings are about. Lower than P1 because it risks
breaking a green pipeline if `@napi-rs/keyring` turns out to need its install
scripts.

**Independent Test**: Push the branch and confirm the `build`,
`integration-tests` and `publish` jobs are green.

**Acceptance Scenarios**:

1. **Given** the CI workflow, **When** it installs dependencies, **Then** it
   uses `npm ci --ignore-scripts`.
2. **Given** the test steps, **When** they run vitest, **Then** they invoke
   the locally installed binary rather than letting `npx` fetch one.
3. **Given** `@napi-rs/keyring` is a native module, **When** `--ignore-scripts`
   is in force, **Then** the credential-store integration suite still passes —
   and if it does not, the `--ignore-scripts` hunk is reverted rather than
   worked around.

---

### Edge Cases

- **`.specify/` is vendored.** Two findings live in the spec-kit tree, which
  is overwritten by the next `specify` upgrade. Fixing them in place is
  accepted as possibly-temporary; excluding the tree from analysis is out of
  scope for this feature (it is a project-settings change, not a code change).
- **An integration test file that Sonar reads as empty.** `S2187` fires on
  `auth.integration.test.ts` because its only test is declared through the
  `itIntegration` alias, which the rule's detector does not recognise as a
  test declaration. The file must keep skipping outside integration runs.
- **Parameterising tests must not lose a case.** Both `S5976` fixes replace N
  `it(...)` blocks with one table; the table must carry every original input
  and expectation, and the reported test names must still identify the case.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every one of the 35 OPEN/CONFIRMED SonarCloud findings on
  `develop` MUST be resolved by a source change in this repository. No finding
  is closed by marking it *Won't fix* / *False positive* in SonarCloud.
- **FR-002**: No CLI command's stdout, stderr, exit code, option set or help
  text may change.
- **FR-003**: No runtime or dev dependency may be added, removed or bumped.
- **FR-004**: No test may be deleted, skipped or weakened. Assertions may be
  restated (e.g. `.length).toBe(n)` → `toHaveLength(n)`) and cases may be
  folded into a parameterised table, provided every input/expectation pair
  survives.
- **FR-005**: The three functions over the cognitive-complexity limit
  (`pr.ts` `pr comments` action at 46, `commands/auth.ts` `handleLogout` at
  18, `services/auth.ts` `findDotEnvPat` at 17) MUST be brought under 15 by
  extracting named helpers, not by suppressing the rule.
- **FR-006**: CI MUST install with `--ignore-scripts` and MUST run vitest from
  the installed dependency rather than via on-demand `npx` resolution.
- **FR-007**: The devcontainer bootstrap MUST pin HTTPS on every
  `curl | shell` install, pass `--ignore-scripts` to its global npm install,
  and pass `--no-build` to `uv tool install`.
- **FR-008**: `scripts/compute-version.sh` MUST use `[[ ]]` for its
  conditional tests, with no change to the versions or tags it computes.
- **FR-009**: `// NOSONAR` and inline rule suppressions MUST NOT be used to
  close any of the 35.

### Key Entities

- **SonarCloud finding**: `{ rule, component, line, message }` as returned by
  the issues API. The authoritative list is the 35 captured at spec time; the
  feature is done when a re-query returns none of them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The SonarCloud OPEN+CONFIRMED count for `develop` goes from 35
  to 0 after merge.
- **SC-002**: `npm test && npm run lint` passes with the same number of
  passing tests as before the change (parameterised tables may change the
  *shape* of the report, not the set of assertions executed).
- **SC-003**: The CI workflow is green on the feature branch, including the
  keyring-backed credential-store integration suite.
- **SC-004**: Zero new SonarCloud findings are introduced by the fixes
  themselves (checked on the PR's own analysis).
