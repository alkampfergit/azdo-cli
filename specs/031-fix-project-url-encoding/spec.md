# Feature Specification: Fix URL Percent-Encoding for ADO Project Names with Spaces

**Feature Branch**: `031-fix-project-url-encoding`
**Created**: 2026-06-16
**Status**: Draft
**Input**: Issue #71 — Problems with team project with space in the name

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Auto-detect Project with Spaces in Name (Priority: P1)

As an azdo-cli user working in a git repository linked to an Azure DevOps project whose name contains spaces (e.g., "Course Examples Builds"), when I run any `azdo` command that auto-detects the project from the git remote — without passing `--project` — the correct project name is used in all API calls and the command succeeds.

**Why this priority**: This is the root bug. Users who work in repos with space-containing project names cannot use auto-detection at all today; every auto-detected call hits the wrong URL. Fixing this unblocks all such users.

**Independent Test**: In a git repo whose remote is `https://dev.azure.com/org/Course%20Examples%20Builds/_git/repo`, run `azdo get-item <id>` without `--project`. The command must return the correct work item, not a 404 or URL-encoding error.

**Acceptance Scenarios**:

1. **Given** a git repo with remote `https://dev.azure.com/gianmariaricci/Course%20Examples%20Builds/_git/JavaCalendar`, **When** `azdo get-item 44119` is run without `--project`, **Then** the tool calls the ADO API with project name `Course Examples Builds` (decoded) and returns the correct work item.
2. **Given** the same repo, **When** any `azdo` command that uses auto-detected project is run, **Then** the ADO API URL contains the correct project name (spaces, not `%2520`).
3. **Given** a remote URL with a userinfo prefix (`https://user:token@dev.azure.com/org/My%20Project/_git/repo`), **When** `azdo` auto-detects the project, **Then** the userinfo prefix does not interfere with project name extraction or decoding.

---

### User Story 2 - Explicit Project Flag Continues to Work (Priority: P2)

As an azdo-cli user who explicitly passes `--project "Course Examples Builds"`, the command must continue to work correctly — the fix must not regress the workaround path.

**Why this priority**: The workaround of supplying `--project` explicitly already works. It must remain intact after the fix.

**Independent Test**: Run `azdo get-item <id> --org gianmariaricci --project "Course Examples Builds"` and confirm it returns the correct result, same as before the change.

**Acceptance Scenarios**:

1. **Given** any git repo, **When** `--project "Course Examples Builds"` is supplied, **Then** the tool uses that value verbatim (no re-encoding) and the API call succeeds.
2. **Given** a project name without spaces, **When** `--project "SimpleProject"` is supplied, **Then** behaviour is unchanged.

---

### User Story 3 - Non-space Project Names Unaffected (Priority: P3)

As a user whose ADO project name contains no spaces, all existing `azdo` commands must continue to behave exactly as they did before the fix.

**Why this priority**: Regression safety — the fix must be narrowly scoped to percent-encoded names only.

**Independent Test**: Run the full existing integration suite (or smoke test) against a standard repo with a simple project name and confirm no behaviour change.

**Acceptance Scenarios**:

1. **Given** a remote URL `https://dev.azure.com/org/SimpleProject/_git/repo`, **When** `azdo get-item <id>` is run, **Then** the project name `SimpleProject` is used unchanged and the call succeeds.

---

### Edge Cases

- What happens when the remote URL has multiple consecutive `%`-encoded characters (e.g., `My%20Awesome%20Project`)?
- How does the tool behave when the remote URL is SSH-format (no percent-encoding path, e.g., `git@ssh.dev.azure.com:v3/org/Project/repo`)?
- What if the remote URL is not an ADO URL at all (e.g., a GitHub remote)?
- What if the project name contains `%` as a literal character in its actual name (not encoding)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The CLI MUST decode percent-encoded characters in the project name segment when extracting the project name from an ADO git remote URL (e.g., `%20` → space, `%2B` → `+`).
- **FR-002**: The decoded project name MUST be used as-is in all outgoing API calls — no re-encoding of the already-decoded name.
- **FR-003**: The fix MUST apply to all `azdo` commands that auto-detect the project from the git remote (get-item, pipeline, pr, etc.).
- **FR-004**: Explicit `--project` values supplied by the user MUST be passed through unchanged (no additional encoding or decoding applied).
- **FR-005**: Remote URLs with a userinfo prefix (`user:token@`) MUST still parse correctly after the fix.
- **FR-006**: Remote URLs that contain no percent-encoded characters MUST continue to parse correctly and produce unchanged results.
- **FR-007**: SSH-format remotes and non-ADO remotes MUST be handled gracefully (either parsed correctly or rejected with an appropriate error, same as current behaviour).

### Assumptions

- The git remote URL is the canonical source of the project name when `--project` is not supplied; the fix is confined to that parsing path.
- Standard URL percent-decoding (`%XX` → character) is the correct transformation; double-decoding is not needed (the stored URL is single-encoded).
- The tool does not need to re-encode the project name before embedding it in API path segments — ADO's REST API accepts project names with spaces as-is when used in standard URI path construction.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `azdo get-item <id>` succeeds in a repo whose ADO project name contains spaces when no `--project` flag is provided (currently fails with wrong URL / 404).
- **SC-002**: All existing automated tests continue to pass after the fix (zero regressions for simple project names).
- **SC-003**: The project name extracted from a percent-encoded remote URL exactly matches the human-readable name (e.g., `Course Examples Builds`, not `Course%20Examples%20Builds`).
- **SC-004**: No new `--project` workaround is required for users with space-containing project names after the fix is deployed.
