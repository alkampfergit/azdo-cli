# Feature Specification: Fix malformed work item ArtifactLink URI

**Feature Branch**: `035-fix-workitem-artifact-uri`
**Created**: 2026-08-26
**Status**: Draft
**Input**: User description: GitHub issue alkampfergit/azdo-cli#84 — `azdo pr work-items link <id>` writes a malformed ArtifactLink URI (literal `/` instead of percent-encoded `%2F` between the project id, repository id, and PR id segments), so Azure DevOps stores the relation but never renders it in the pull request's "Work Items" panel or the work item's "Development" section, even though the CLI reports success.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Linking a work item makes it visible in the Azure DevOps UI (Priority: P1)

A CLI user runs `azdo pr work-items link <workItemId> --pr-number <N> --org <org> --project <project>` to associate a work item with a pull request. They expect the link to appear in the Azure DevOps web UI (the PR's "Work Items" panel and the work item's "Development" section) — that visibility is the entire point of running the command.

**Why this priority**: This is the sole purpose of the command. A link that the CLI reports as created but that Azure DevOps never displays is a silent correctness failure — the primary user-facing promise of the feature is broken.

**Independent Test**: Link a real work item to a real PR via the CLI, then open the PR in the Azure DevOps web UI and confirm the work item appears in the "Work Items" panel (and the work item's "Development" section shows the PR). Can be fully tested end-to-end against a live ADO project without any other feature.

**Acceptance Scenarios**:

1. **Given** a work item and a PR that are not yet linked, **When** the user runs `azdo pr work-items link`, **Then** the CLI reports `noop: false` and the Azure DevOps web UI shows the work item in the PR's "Work Items" panel.
2. **Given** a work item and PR already linked via this command, **When** the user runs `azdo pr work-items link` again with the same ids, **Then** the CLI reports `noop: true` (no duplicate relation is written) and the existing link is still visible in the Azure DevOps web UI.

---

### User Story 2 - Unlinking removes the same relation the CLI created (Priority: P2)

A CLI user who previously linked a work item to a PR runs `azdo pr work-items unlink` to remove that association, and expects the relation to be found and removed using the same identity the CLI used to create it.

**Why this priority**: Unlink correctness depends directly on the fix to the link URI — both operations must agree on the canonical URI or unlink will fail to find (or will falsely match) a relation.

**Independent Test**: Link then unlink a work item/PR pair via the CLI; confirm the relation is gone from both the work item's relations and the Azure DevOps UI.

**Acceptance Scenarios**:

1. **Given** a work item linked to a PR by this CLI (after the fix), **When** the user runs `azdo pr work-items unlink`, **Then** the relation is removed and the CLI reports success.

---

### Edge Cases

- What happens when a work item already carries a relation written by the CLI *before* this fix (the old, malformed URI)? The new code must not be silently blind to it — see Assumptions for how link/unlink treat pre-existing malformed relations.
- What happens when the project id or repository id (GUIDs) themselves contain characters requiring percent-encoding? The URI construction must percent-encode each segment independently, not just join with `%2F`.
- What happens when `--json` output is requested? The reported `url` field must reflect the corrected, canonical URI so JSON consumers see the true stored value.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST construct the work item ArtifactLink URI for a pull request by percent-encoding the project id and repository id segments and joining all three segments (project id, repository id, PR id) with the literal string `%2F`, matching Azure DevOps' canonical artifact URI scheme (`vstfs:///Git/PullRequestId/<projectId>%2F<repositoryId>%2F<prId>`).
- **FR-002**: The "already linked" check performed before creating a new relation MUST compare against the corrected, canonical URI.
- **FR-003**: The unlink lookup that finds an existing relation to remove MUST compare against the corrected, canonical URI, so link and unlink stay mutually consistent.
- **FR-004**: When the CLI reports a link result (human-readable or `--json`), the reported `url` MUST be the corrected, canonical URI actually stored on the work item.
- **FR-005**: The fix MUST NOT change any other relation types or fields already present on a work item's relations list.

### Key Entities

- **ArtifactLink relation**: A relation entry on an Azure DevOps work item with `rel: "ArtifactLink"` and a `url` in the `vstfs:///Git/PullRequestId/...` scheme, linking the work item to a specific pull request.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After linking a work item to a PR via the CLI, the work item is visible in that PR's "Work Items" panel in the Azure DevOps web UI on first attempt (no manual re-link needed).
- **SC-002**: Running the link command twice against the same work item/PR pair reports `noop: true` on the second call and does not create a duplicate relation.
- **SC-003**: Running unlink after link removes the relation such that the work item no longer appears in the PR's "Work Items" panel.

## Assumptions

- This fix changes only how new/matched ArtifactLink URIs are constructed and compared going forward. Migrating or cleaning up relations already written with the old malformed URI on real Azure DevOps work items is out of scope for this CLI code change — the issue itself calls this out as a follow-up for affected users, not something the tool needs to automate.
- The percent-encoding scheme uses standard URI percent-encoding (`encodeURIComponent`-equivalent) on the project id and repository id GUID strings before joining with the literal `%2F` separator.
