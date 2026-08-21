# Feature Specification: PR Work Item Links, Reviewer Management, and Template-Aware Creation

**Feature Branch**: `034-pr-link-review`
**Created**: 2026-08-21
**Status**: Draft
**Input**: User description: "Missing features in the pr features. For the PR command I miss explicitly some functionalities. 1. Link a work task by id to the pull request (and also remove the link) 2. Add / remove required and optional reviewer. Also I have a repository where I have a default pr template, in location: docs/pull_request_template/branches/develop.md ... I want you to support these pull request templates, if a template exists you should use the template to create the pull request adding your information at the beginning."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Link and unlink work items on a pull request (Priority: P1)

An operator wants a pull request to show up against the work item(s) it
implements, and to be able to correct a wrong link without recreating the
pull request. Today `azdo pr` has no way to associate a work item id with a
pull request, or to remove such an association.

**Why this priority**: Work item traceability is the most commonly requested
missing capability and the one with the widest blast radius (every PR that
closes a task/bug/story needs it) — it is independently valuable even before
reviewer management exists.

**Independent Test**: Can be fully tested by running the new link command
against an existing pull request with a work item id, confirming the link
appears in Azure DevOps, then running the unlink command and confirming it no
longer appears — no dependency on reviewer or template support.

**Acceptance Scenarios**:

1. **Given** an open pull request and a valid, existing work item id in the
   same project, **When** the operator links the work item to the pull
   request, **Then** the command succeeds and the work item subsequently
   appears in the pull request's linked work items.
2. **Given** a pull request that already has a work item linked, **When** the
   operator requests to unlink that same work item id, **Then** the command
   succeeds and the work item no longer appears among the pull request's
   linked work items.
3. **Given** a work item id that does not exist in the project, **When** the
   operator attempts to link it, **Then** the command fails with a message
   naming the work item id and exits without modifying the pull request.
4. **Given** a work item id that is not currently linked to the pull request,
   **When** the operator attempts to unlink it, **Then** the command reports
   this as a no-op rather than an error.

---

### User Story 2 - Add and remove required and optional reviewers (Priority: P2)

An operator wants to add a reviewer to a pull request — either as a required
approver or an optional one — and to remove a reviewer they added by mistake
or who is no longer needed, without leaving the CLI.

**Why this priority**: Reviewer management is the second most-cited gap; it
depends only on being able to resolve a reviewer identity and the pull
request, independent of work item linking or template support.

**Independent Test**: Can be fully tested by adding a reviewer as required,
confirming their vote/required status on the pull request, adding a second
reviewer as optional, then removing one reviewer and confirming they no
longer appear as a reviewer — no dependency on User Story 1 or 3.

**Acceptance Scenarios**:

1. **Given** an open pull request and a reviewer identity that exists in the
   organization, **When** the operator adds that reviewer as required,
   **Then** the reviewer appears on the pull request marked as required.
2. **Given** the same setup, **When** the operator adds a different reviewer
   as optional (the default when required/optional is not specified),
   **Then** that reviewer appears on the pull request marked as optional.
3. **Given** a pull request with a reviewer already attached, **When** the
   operator removes that reviewer, **Then** the reviewer no longer appears on
   the pull request.
4. **Given** a reviewer identity that cannot be resolved in the organization,
   **When** the operator attempts to add them, **Then** the command fails
   with a message naming the identity that could not be resolved and makes no
   change to the pull request.
5. **Given** a reviewer already on the pull request as optional, **When** the
   operator re-adds the same reviewer as required, **Then** the reviewer's
   required flag is updated to required (no duplicate reviewer entry is
   created).

---

### User Story 3 - Create pull requests from a repository-defined template (Priority: P3)

An operator whose repository defines a default pull request description
template (optionally varying per target branch) wants `pr open` to start
from that template instead of requiring the full description to be typed on
the command line every time, while still being able to prepend their own
summary.

**Why this priority**: Valuable but narrower in scope than linking or
reviewers — it changes only pull request creation, and a reasonable
workaround (typing the whole description manually) already exists.

**Independent Test**: Can be fully tested by adding a template file for a
target branch, opening a pull request to that branch, and confirming the
created pull request's description contains the operator's supplied text
followed by the template content — no dependency on Stories 1 or 2.

**Acceptance Scenarios**:

1. **Given** a repository with a template file specific to the pull request's
   target branch, **When** the operator opens a pull request without
   passing `--description`, **Then** the created pull request's description
   consists of the template content, unmodified.
2. **Given** the same branch-specific template exists, **When** the operator
   opens a pull request and also passes `--description`, **Then** the
   created pull request's description is the operator's supplied text
   followed by the template content, in that order.
3. **Given** no branch-specific template exists but a repository-wide default
   template exists, **When** the operator opens a pull request to a branch
   with no matching branch-specific file, **Then** the repository-wide
   default template is used in its place.
4. **Given** no template of any kind exists for the target branch, **When**
   the operator opens a pull request without `--description`, **Then** the
   command fails as it does today, requiring an explicit description.

---

### Edge Cases

- Linking a work item that is already linked to the pull request is a no-op,
  not an error (idempotent add).
- Unlinking the last remaining linked work item leaves the pull request with
  zero linked work items — that is a valid end state, not an error.
- Adding a reviewer who is already required (re-adding with the same
  required state) is a no-op.
- Removing a reviewer who is not currently on the pull request is reported
  as a no-op rather than an error.
- A template file exists but is empty: the pull request description is
  exactly the operator-supplied text (or, if none was supplied, creation
  still requires an explicit description per Acceptance Scenario 4).
- Work item link, reviewer, and template operations all resolve the target
  pull request the same way existing `pr` write commands do (`--pr-number`
  or the current branch's single open pull request).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an operator to link an existing work item, by
  numeric id, to a pull request.
- **FR-002**: System MUST allow an operator to remove a previously linked
  work item, by numeric id, from a pull request.
- **FR-003**: System MUST reject linking a work item id that does not exist
  in the resolved project, naming the id in the error, and MUST NOT modify
  the pull request in that case.
- **FR-004**: System MUST treat unlinking a work item id that is not
  currently linked as a successful no-op, not an error.
- **FR-005**: System MUST treat linking a work item id that is already
  linked as a successful no-op, not an error.
- **FR-006**: System MUST allow an operator to add a reviewer, identified by
  their Azure DevOps identity (email or unique name), to a pull request.
- **FR-007**: System MUST allow the operator to designate an added reviewer
  as either required or optional, defaulting to optional when not specified.
- **FR-008**: System MUST allow an operator to remove a reviewer from a pull
  request.
- **FR-009**: System MUST reject an add-reviewer request whose identity
  cannot be resolved in the organization, naming the identity in the error,
  and MUST NOT modify the pull request in that case.
- **FR-010**: System MUST treat removing a reviewer who is not currently on
  the pull request as a successful no-op, not an error.
- **FR-011**: System MUST treat re-adding a reviewer already on the pull
  request, with a different required/optional designation, as updating that
  designation rather than creating a duplicate entry.
- **FR-012**: When creating a pull request (`pr open`) without an explicit
  description, system MUST look for a repository-defined pull request
  template matching the pull request's target branch and, if found, use its
  content as the description instead of requiring `--description`.
- **FR-013**: System MUST fall back to a repository-wide default template
  when no branch-specific template matches the target branch, and MUST
  require an explicit `--description` when no template of either kind
  exists (current behavior, unchanged).
- **FR-014**: When creating a pull request with both an explicit
  `--description` and a matching template, system MUST compose the
  description as the operator-supplied text followed by the template
  content.
- **FR-015**: Every new write operation (link, unlink, add-reviewer,
  remove-reviewer) MUST resolve its target pull request using the same
  `--pr-number` / current-branch-auto-detection convention as existing `pr`
  write commands, and MUST support `--json` output on success.

### Key Entities

- **Work Item Link**: An association between a pull request and a work item
  id; identified by the pair (pull request id, work item id); has no other
  state besides existing or not existing.
- **Reviewer**: An identity (person or group) attached to a pull request;
  has a required/optional designation and a vote status reported by Azure
  DevOps (read-only from this feature's perspective).
- **Pull Request Template**: A text file in the repository whose content
  becomes the default pull request description; resolved per target branch,
  falling back to a repository-wide default.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can link a work item to a pull request, or remove
  such a link, in a single command invocation with no manual steps in the
  Azure DevOps web UI.
- **SC-002**: An operator can add or remove a required or optional reviewer
  in a single command invocation with no manual steps in the Azure DevOps
  web UI.
- **SC-003**: In a repository with a branch-specific pull request template,
  100% of `pr open` invocations without `--description` succeed using the
  template instead of failing for a missing description.
- **SC-004**: Every new failure path (unresolvable work item, unresolvable
  reviewer) names the offending id/identity in its error message, so an
  operator can diagnose the failure without additional lookups.
