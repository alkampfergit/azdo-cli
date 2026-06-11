# Feature Specification: Work Item Relations Support

**Feature Branch**: `027-work-item-relations`
**Created**: 2026-06-10
**Status**: Draft
**Input**: User description: "Parent / child and other relations support — add azdo relations commands to list relation types, add/remove relations between work items, and list relations for a specific work item."

## Interface Recommendation

The original proposal uses `azdo relations list` for two distinct purposes (list types and list a work item's relations). This creates an ambiguous interface. The recommended structure is:

| Command | Purpose |
|---------|---------|
| `azdo relations types` | List all available relation type names for the project |
| `azdo relations list <id>` | List all relations on a specific work item |
| `azdo relations add <type> <id1> <id2>` | Add a relation of `type` from `id1` to `id2` |
| `azdo relations remove <type> <id1> <id2>` | Remove an existing relation of `type` between `id1` and `id2` |

This separates the "discover relation types" concern (`types`) from the "inspect a work item's relations" concern (`list <id>`), matching the pattern already used by other `azdo` command groups.

## User Scenarios & Testing

### User Story 1 - Discover Available Relation Types (Priority: P1)

A user wants to know which relation type names are valid before adding a relation. They run a single command that lists all supported relation types for the current project/organisation.

**Why this priority**: Required as a prerequisite for US2 and US3 — users must know valid type names before they can form correct add/remove commands.

**Independent Test**: Running `azdo relations types` against a live ADO organisation prints at least one relation type name. The command can be fully tested without US2 or US3.

**Acceptance Scenarios**:

1. **Given** a valid ADO context, **When** the user runs `azdo relations types`, **Then** the output lists every available relation type, each with its internal name and a human-readable display name.
2. **Given** a valid ADO context and `--json` flag, **When** the user runs `azdo relations types --json`, **Then** the output is a JSON array of relation type objects.
3. **Given** an invalid PAT, **When** the user runs `azdo relations types`, **Then** an error message indicates the authentication failure without a stack trace.

---

### User Story 2 - Add or Remove a Relation Between Two Work Items (Priority: P2)

A user wants to create or delete a directional link between two work items (e.g., make work item 2000 a child of work item 1000, or remove that link).

**Why this priority**: Core write capability — the main value of the feature. Depends on knowing valid type names (US1).

**Independent Test**: Running `azdo relations add child <id1> <id2>` on a real ADO project creates the relation and subsequent inspection of either work item confirms the link exists.

**Acceptance Scenarios**:

1. **Given** two existing work items and a valid relation type name, **When** the user runs `azdo relations add <type> <id1> <id2>`, **Then** the relation is created and a success confirmation is printed with both IDs and the type.
2. **Given** an existing relation between two work items, **When** the user runs `azdo relations remove <type> <id1> <id2>`, **Then** the relation is removed and a success confirmation is printed.
3. **Given** a relation that already exists, **When** the user runs `azdo relations add` for the same pair and type, **Then** the command succeeds idempotently (no duplicate created, clear message).
4. **Given** a relation that does not exist, **When** the user runs `azdo relations remove` for that pair and type, **Then** the command returns a clear "relation not found" message without crashing.
5. **Given** a non-existent work item ID, **When** the user runs `azdo relations add`, **Then** a clear "work item not found" error is shown.
6. **Given** an invalid relation type name, **When** the user runs `azdo relations add`, **Then** a clear "unknown relation type" error is shown.

---

### User Story 3 - List Relations on a Work Item (Priority: P3)

A user wants to inspect all existing relations on a specific work item to understand its connections to other items.

**Why this priority**: Read-only inspection — useful for verification but not blocking US2. Lower priority because add/remove already implies a confirmation message.

**Independent Test**: Running `azdo relations list <id>` for a work item that has at least one relation prints the related work item IDs, their types, and basic titles.

**Acceptance Scenarios**:

1. **Given** a work item with relations, **When** the user runs `azdo relations list <id>`, **Then** each relation is listed with: relation type name, related work item ID, and related work item title.
2. **Given** a work item with no relations, **When** the user runs `azdo relations list <id>`, **Then** the output clearly states no relations exist (not a blank screen).
3. **Given** a `--json` flag, **When** the user runs `azdo relations list <id> --json`, **Then** the output is a JSON array of relation objects with consistent field names.
4. **Given** a non-existent work item ID, **When** the user runs `azdo relations list <id>`, **Then** a clear "work item not found" error is shown.

---

### Edge Cases

- What happens when `id1 == id2` in `add` or `remove`? → Should return a clear error ("cannot relate a work item to itself").
- What happens when the relation type name uses different casing (e.g., `Child` vs `child`)? → Type lookup should be case-insensitive.
- What happens when the user omits required arguments? → The CLI should print usage help automatically.
- What happens when the ADO project has no custom relation types configured? → `types` returns only the built-in types (which ADO always provides).

## Requirements

### Functional Requirements

- **FR-001**: The CLI MUST provide an `azdo relations types` subcommand that lists all relation type names available in the current ADO organisation.
- **FR-002**: Each relation type in the listing MUST show its internal reference name and its human-readable display name.
- **FR-003**: The CLI MUST provide an `azdo relations add <type> <id1> <id2>` subcommand that creates a directed relation of the given type between two work items.
- **FR-004**: The CLI MUST provide an `azdo relations remove <type> <id1> <id2>` subcommand that deletes an existing relation between two work items.
- **FR-005**: The CLI MUST provide an `azdo relations list <id>` subcommand that lists all relations on the specified work item, including related item IDs, titles, and relation type names.
- **FR-006**: All `relations` subcommands MUST support a `--json` flag for machine-readable output with consistent field names.
- **FR-007**: `azdo relations add` MUST be idempotent: if the relation already exists, the command succeeds without creating a duplicate.
- **FR-008**: All `relations` subcommands MUST produce clear, actionable error messages for invalid IDs, unknown relation types, and authentication failures.
- **FR-009**: Relation type matching in `add` and `remove` MUST be case-insensitive to reduce user friction.

### Key Entities

- **RelationType**: A named link category supported by ADO. Has a reference name (e.g., `System.LinkTypes.Hierarchy-Reverse`) and a display name (e.g., `Parent`). The user types a simplified alias (e.g., `parent`, `child`).
- **WorkItemRelation**: A directed link from one work item to another, characterised by a relation type and the ID/title of the target work item.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A user can discover all valid relation type names in a single command invocation without consulting external documentation.
- **SC-002**: A user can add or remove a relation between two work items in a single command invocation.
- **SC-003**: All three subcommands (`types`, `add`/`remove`, `list`) produce valid JSON output when `--json` is passed, parseable by standard tools.
- **SC-004**: Error messages for the top 5 failure modes (bad ID, unknown type, auth failure, self-relation, missing args) are self-explanatory without requiring a manual lookup.
- **SC-005**: The feature adds zero new runtime dependencies to the project.

## Assumptions

- The existing org/project/PAT context resolution (from config or environment) applies without change — no new auth surface.
- ADO relation type reference names are stable across API versions; display names may vary by locale but reference names do not.
- `add child 1000 2000` is interpreted as: id1=1000 is the anchor, id2=2000 gets the relation (becomes the child). The direction is encoded in the type name chosen by the user.
- The `--json` output contract follows the same field-naming conventions used by existing `azdo` commands.
- Integration tests will target the existing `gianmariaricci/azdocli` test org; at least one work item with an existing relation must be available for read-path tests.
