# Feature Specification: Multi-Organization Support

**Feature Branch**: `025-multi-org-support`
**Created**: 2026-06-05
**Status**: Draft
**Input**: User description: "Multi-organization support fixes for the azdo CLI (GitHub issue #55): remote discovery for any Azure DevOps remote name, consistent embedded-credentials warning, graceful degradation for missing custom fields, per-organization configuration scoping with list/delete/move, suppress git noise outside git repositories"

## Clarifications

### Session 2026-06-05

- Q: For list-valued keys such as `fields`, should an org-scoped value REPLACE the default list or MERGE with it? → A: Fully replace [owner: alkampfergit, 2026-06-05]
- Q: When should the embedded-credentials warning fire — any userinfo, token-only, or config-suppressible? → A: Only when a password/token is embedded (`user:secret@`); bare `user@` is silent [owner: alkampfergit, 2026-06-05]

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Per-organization configuration (Priority: P1)

A user works with two Azure DevOps organizations: a primary one where custom fields (e.g. `Custom.BusinessDescription`) exist, and a secondary one where they do not. Today configuration is global, so settings tuned for the primary organization break commands against the secondary one. The user must be able to keep a **default configuration** that applies to every organization, and additionally create **organization-scoped configurations** that apply only to a named organization. The user can list all configurations together with the organization they belong to, delete a configuration, move (re-scope) a configuration from one organization to another, and **copy** settings from an existing scope (the default or another organization) onto a named organization as a starting point.

**Why this priority**: Explicitly called out as the "REAL IMPORTANT FEATURE" in the issue; it is the root fix that makes every other multi-org workflow viable.

**Independent Test**: Set a default `fields` configuration plus an org-scoped `fields` configuration for org B; run a work-item command against org A (default applies) and against org B (org-scoped applies); list, delete, and move the org-scoped entry.

**Acceptance Scenarios**:

1. **Given** a default configuration value and no org-scoped value, **When** a command runs against any organization, **Then** the default value applies.
2. **Given** a default value and an org-scoped value for organization `acme`, **When** a command runs against `acme`, **Then** the org-scoped value applies; **When** the same command runs against any other organization, **Then** the default value applies.
3. **Given** existing configurations, **When** the user lists configurations, **Then** each entry shows its scope (default or the organization name) alongside key and value.
4. **Given** an org-scoped configuration, **When** the user deletes it, **Then** commands against that organization fall back to the default configuration.
5. **Given** an org-scoped configuration for organization `acme`, **When** the user moves it to organization `globex`, **Then** it no longer applies to `acme` and now applies to `globex`.
6. **Given** settings in an existing scope (default or organization `acme`), **When** the user copies them to organization `globex`, **Then** `globex` gets its own independent copy, the source scope is unchanged, and later edits to either scope do not affect the other.
7. **Given** an existing pre-feature (global) configuration file, **When** the upgraded CLI runs, **Then** existing settings keep working unchanged as the default configuration (no manual migration).

---

### User Story 2 - Missing custom fields degrade to a warning (Priority: P2)

A user has configured custom fields that exist in their primary organization. When they run a work-item command (e.g. `get-item`) against an organization where one or more of those fields do not exist, the command currently fails outright ("Request rejected: TF51535: Cannot find field …") and prints nothing. Instead, the command must warn about each missing field and still render the work item with all the fields that do exist.

**Why this priority**: Today this failure produces zero output, making the CLI unusable against secondary organizations until configuration is fixed; graceful degradation restores usefulness immediately even before per-org config is set up.

**Independent Test**: Configure a custom field that does not exist in the target organization, run a work-item read command, and verify the output contains the work item's real fields plus a warning naming the missing field, with a success exit code.

**Acceptance Scenarios**:

1. **Given** a configured field that does not exist in the target organization, **When** the user fetches a work item, **Then** the work item is rendered with all available fields, a warning names each missing field, and the command exits successfully.
2. **Given** all configured fields exist in the target organization, **When** the user fetches a work item, **Then** behaviour is unchanged (no warning).
3. **Given** JSON output mode, **When** missing fields are skipped, **Then** warnings go to the error stream so the JSON payload remains clean and parseable.

---

### User Story 3 - Remote discovery works with any remote name (Priority: P2)

A user's repository has its Azure DevOps remote under a name other than `origin` (e.g. `origin` points to GitHub and another remote points to Azure DevOps, or vice versa). Organization/project auto-detection currently only inspects `origin`. Detection must consider all git remotes: when exactly one remote is an Azure DevOps URL, that remote must be used regardless of its name.

**Why this priority**: Without it, every command in a multi-remote repository requires explicit `--org`/`--project` flags; it blocks the issue author's daily workflow.

**Independent Test**: In a repository whose only Azure DevOps remote is named something other than `origin`, run a work-item command without `--org`/`--project` and verify the organization/project are detected from that remote.

**Acceptance Scenarios**:

1. **Given** a repository where `origin` is not an Azure DevOps URL but exactly one other remote is, **When** a command needs org/project, **Then** they are detected from that remote.
2. **Given** a repository where `origin` is an Azure DevOps URL, **When** a command needs org/project, **Then** `origin` keeps being used (no behaviour change).
3. **Given** multiple distinct Azure DevOps remotes, **When** a command needs org/project, **Then** `origin` wins if it is one of them; otherwise the command reports the ambiguity and asks for `--org`/`--project` (it must not silently guess).
4. **Given** no Azure DevOps remote at all, **When** a command needs org/project, **Then** the existing "provide --org and --project" guidance is shown.

---

### User Story 4 - No git noise outside a git repository (Priority: P3)

A user runs the CLI from a directory that is not a git repository, relying on default/org configuration for context. The command works, but git's own `fatal: not a git repository (or any of the parent directories): .git` lines leak to the console (twice in the reported output). The tool is expected to work outside git folders, so git's error output must never reach the user; the CLI's own friendly guidance is the only message allowed.

**Why this priority**: Cosmetic but confusing; cheap to fix and explicitly reported.

**Independent Test**: Run a work-item command from a non-git directory with a default organization configured and verify the output contains no `fatal:` lines.

**Acceptance Scenarios**:

1. **Given** a non-git working directory and sufficient configuration to resolve org/project, **When** any command runs, **Then** no git error text appears in the output and the command succeeds.
2. **Given** a non-git working directory and no way to resolve org/project, **When** a command runs, **Then** only the CLI's own guidance ("provide --org and --project…") is shown — still no raw git `fatal:` text.

---

### User Story 5 - Embedded-credentials warning is consistent and explainable (Priority: P3)

A user sees `azdo: warning: origin includes embedded credentials…` when working against their secondary organization but not their primary one, and doesn't understand why. The warning fires when the remote URL embeds userinfo (e.g. `https://username@dev.azure.com/…`), which is how Azure DevOps formats clone URLs by default. The warning must be accurate (name the actual remote it refers to, which may not be `origin` once US3 lands) and must not misfire for URLs that embed only a username without a secret: it fires **only when a password/token is embedded** (`user:secret@`); a bare username (`user@` — Azure DevOps' default clone-URL format) is silent.

**Why this priority**: Informational warning; behaviour is technically correct today but confusing in multi-org setups.

**Independent Test**: Parse remotes with `user@`, `user:token@`, and clean URLs and verify the warning fires per the clarified rule and names the right remote.

**Acceptance Scenarios**:

1. **Given** an Azure DevOps remote embedding a password/token (`user:secret@`), **When** the CLI uses it, **Then** the warning is emitted once per process, on the error stream, naming the remote actually used.
2. **Given** a clean remote URL or one embedding only a bare username (`user@`), **When** the CLI uses it, **Then** no warning is emitted.

---

### Edge Cases

- Organization name comparison for scoped configuration must be case-insensitive (Azure DevOps org slugs are case-insensitive in URLs).
- Moving a configuration onto an organization that already has one for the same key: the operation must fail with a clear message or require an explicit overwrite confirmation — it must not silently merge.
- An org-scoped configuration for a key with an empty/unset default must simply apply for that org and leave other orgs without a value.
- A work item where *all* configured custom fields are missing in the target org: render the work item's intrinsic fields, warn for each missing one, still succeed.
- Field names that differ only by case (`Custom.Foo` vs `custom.foo`): missing-field matching must follow Azure DevOps' case-insensitive field-name semantics.
- Detection in a repository with two remotes pointing at the *same* Azure DevOps org/project under different names: not ambiguous — use that org/project.
- `--org`/`--project` flags always win over any remote detection or configuration (existing behaviour preserved).

## Requirements *(mandatory)*

### Functional Requirements

**Per-organization configuration (US1)**

- **FR-001**: The system MUST support configuration entries scoped to a single named organization in addition to the existing default (organization-independent) entries.
- **FR-002**: When resolving a configuration key for a command, the system MUST use the org-scoped value when one exists for the target organization, otherwise the default value. Resolution is per key: an org-scoped configuration overrides only the keys it defines. For list-valued keys (e.g. `fields`) the org-scoped value FULLY REPLACES the default list for that organization — no merging or inheritance from the default list.
- **FR-003**: Users MUST be able to create or update an org-scoped value by naming the organization at set time.
- **FR-004**: Users MUST be able to list all configuration entries with their scope visible (default vs organization name), in both human-readable and JSON output.
- **FR-005**: Users MUST be able to delete an org-scoped entry without affecting the default configuration.
- **FR-006**: Users MUST be able to move an org-scoped entry to a different organization in one operation.
- **FR-006a**: Users MUST be able to copy settings from an existing scope (the default scope or another organization) onto a named organization in one operation; the source scope is left unchanged and the copy is independent thereafter. Copying onto an organization that already has settings for the same key(s) fails with a clear message unless the user explicitly confirms overwrite.
- **FR-007**: Existing configuration files from previous releases MUST keep working unchanged as the default scope, with no manual migration step.

**Missing custom fields (US2)**

- **FR-008**: When one or more configured fields do not exist in the target organization, work-item read commands MUST still render the work item using all fields that do exist.
- **FR-009**: Each missing field MUST produce a warning on the error stream naming the field; the command's exit code MUST indicate success.
- **FR-010**: JSON output MUST remain valid and free of warning text when fields are skipped.

**Remote discovery (US3)**

- **FR-011**: Organization/project auto-detection MUST consider all git remotes, not only `origin`.
- **FR-012**: When exactly one remote (or several remotes agreeing on the same org/project) is an Azure DevOps URL, detection MUST use it regardless of remote name.
- **FR-013**: When multiple remotes resolve to different Azure DevOps org/projects, `origin` MUST win if it is among them; otherwise the command MUST fail with a message listing the candidates and asking for `--org`/`--project`.
- **FR-014**: Explicit `--org`/`--project` flags and applicable configuration MUST keep taking precedence over remote detection (existing precedence preserved).

**Git noise suppression (US4)**

- **FR-015**: Git's own error output (e.g. `fatal: not a git repository`) MUST never appear in CLI output; failures to read git state are handled silently and surface only as the CLI's existing friendly guidance when context cannot be resolved.

**Embedded-credentials warning (US5)**

- **FR-016**: The warning MUST fire only when the remote URL embeds a password/token (`user:secret@`) — a bare username (`user@`) MUST NOT trigger it. It MUST reference the remote actually used for detection (not hard-code `origin`), fire at most once per process, target the error stream, and never leak any credential content.

### Key Entities

- **Configuration scope**: either *default* (applies to all organizations) or a single *organization name*; each scope holds key/value settings (e.g. `fields`, `markdown`).
- **Configuration entry**: key + value + scope; listable, deletable, movable between scopes, and copyable from one scope to another.
- **Azure DevOps remote**: a git remote whose URL parses to an organization/project pair; candidate input for context detection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user with two organizations can run the same work-item command against both, each picking up its own configuration, with zero per-command flags.
- **SC-002**: A work-item read against an organization missing N configured custom fields produces the work item's content plus exactly N missing-field warnings and exits successfully (today: hard failure, no output).
- **SC-003**: In a repository whose only Azure DevOps remote is not named `origin`, commands resolve org/project automatically with no extra flags (today: error).
- **SC-004**: Running any command outside a git repository produces zero `fatal:` lines in the output.
- **SC-005**: All configuration entries are visible in one listing with their scope, and an org-scoped entry can be created, copied, moved, and deleted using only CLI commands (no manual file editing documented or required).
- **SC-006**: Existing single-org users observe no behaviour change after upgrading without touching their configuration.

## Assumptions

- Org-scoped configuration is keyed by organization only (not organization + project); project-level scoping is out of scope for this feature.
- Organization names in scopes are compared case-insensitively.
- The set of configurable keys is unchanged — this feature adds scoping, not new settings.
- "Move" transfers the whole org-scoped entry set (or a named key) to the new organization and fails loudly on collision rather than merging silently.
- Missing-field degradation applies to read/render paths; write commands that explicitly target a non-existent field keep failing (writing to a missing field is a real error, not noise).
- Auth/credential storage is already keyed per organization (existing behaviour) and is not part of this feature.
