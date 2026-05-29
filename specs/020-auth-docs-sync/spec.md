# Feature Specification: Sync authentication docs

**Feature Branch**: `020-auth-docs-sync`  
**Created**: 2026-05-29  
**Status**: Draft  
**Input**: User description: "Reconcile the Azure DevOps CLI authentication documentation with the current CLI auth surface (issue #41). The reporter believes `azdo auth login` is no longer supported and that other parts of the document are outdated. Owner clarification: `azdo auth login` IS still supported, via a custom Azure AD application (the OAuth flow introduced in #37/#38). Update the documentation so it accurately reflects the current authentication commands and flows. Documentation only — no source code behaviour changes."

## Context

Issue #41 reports that the authentication documentation is out of sync with the tool. Investigation shows the situation is mixed:

- `docs/authentication.md` is **already current** — it documents OAuth as the default, `azdo auth login`, the device-code flow, `--use-pat`, the legacy bare `azdo auth` alias, `azdo auth logout`, `azdo auth status`, and the deprecated `azdo clear-pat`.
- The **entry-point docs predate the OAuth work** (#37/#38) and only describe the PAT path:
  - `README.md` describes storing a PAT via `azdo auth` and never mentions `azdo auth login` or OAuth.
  - `docs/commands.md` lists `azdo auth` as "Store a PAT", omits the `azdo auth login` command entirely, and lists a stale flag set.

A reader who starts from the README or the command reference therefore concludes that login/OAuth is unsupported — exactly the confusion the issue describes. The owner has confirmed `azdo auth login` is supported and works against a custom Azure DevOps (Microsoft Entra) application.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A new user can discover and use the supported login command (Priority: P1)

A person evaluating `azdo-cli` reads the top-level README and the command reference to learn how to authenticate. The documentation correctly tells them that `azdo auth login` is the supported, default (OAuth) way to sign in, alongside the PAT option, so they can authenticate successfully on their first attempt without believing the command was removed.

**Why this priority**: This is the exact failure reported in #41 — the entry-point docs make a supported command look unsupported. Fixing it resolves the reported problem and is the minimum viable outcome.

**Independent Test**: Read `README.md` and `docs/commands.md` end to end as a new user; confirm `azdo auth login` (and OAuth being the default) is presented as a current, supported command and that the steps match the tool's actual behaviour.

**Acceptance Scenarios**:

1. **Given** a reader on the README, **When** they look for how to sign in, **Then** they find `azdo auth login` presented as the default OAuth sign-in, with PAT described as the alternative, and a link to the full authentication guide.
2. **Given** a reader on the command reference (`docs/commands.md`), **When** they scan the command table, **Then** `azdo auth login` is listed with an accurate description and its relevant options, and the existing `azdo auth` / `auth status` / `auth logout` / `clear-pat` rows accurately describe today's behaviour (OAuth + PAT, not PAT-only).

---

### User Story 2 - Every authentication doc is consistent with the implemented commands (Priority: P2)

A user who follows any authentication-related document finds the commands, flags, and flows described there match what the CLI actually does, with no contradictions between documents.

**Why this priority**: The issue says "other parts of the document are outdated too." Beyond the headline login command, cross-document consistency (terminology, command names, deprecations, the OAuth-via-custom-Entra-app flow) prevents the next reader from hitting a different stale statement.

**Independent Test**: Cross-check every command, flag, and flow mentioned in the auth docs against the actual CLI command surface; confirm there are no references to removed/renamed commands and no contradictions between documents.

**Acceptance Scenarios**:

1. **Given** the set of authentication-related docs, **When** each documented command and flag is compared against the actual CLI surface, **Then** every documented command and flag exists and behaves as described, and no removed/renamed command is presented as current.
2. **Given** the OAuth-via-custom-Azure-AD-application flow, **When** a reader follows the registration and login guidance, **Then** the documents agree on the command names, the role of a custom Entra application, and the relevant environment variables / flags, with consistent cross-links between them.

---

### Edge Cases

- A command or flag is mentioned in one doc but missing or differently named in another → the docs must be reconciled to a single accurate description.
- The full guide (`docs/authentication.md`) is already accurate while the summaries are stale → summaries are corrected to point at and agree with the guide; the guide is left correct (only adjusted if a genuine drift from the implementation is found).
- A documented command was genuinely removed/renamed in the current code → it is updated or removed, not left as if current (verification must surface this rather than assume the docs are right).
- Deprecated-but-present commands (e.g. `azdo clear-pat`) → documented as deprecated with the recommended replacement, not deleted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The documentation MUST present `azdo auth login` as a currently supported command, with OAuth (against a Microsoft Entra / Azure AD application) as the default sign-in method and PAT as the supported alternative.
- **FR-002**: The top-level `README.md` authentication summary MUST mention `azdo auth login` and the OAuth default (not only the PAT path) and link to the full authentication guide.
- **FR-003**: The command reference (`docs/commands.md`) MUST include `azdo auth login` with an accurate description and its relevant options, and MUST update the existing `azdo auth`, `azdo auth status`, and `azdo auth logout` entries so their descriptions reflect both OAuth and PAT rather than PAT-only.
- **FR-004**: Every authentication command and flag described in any authentication-related document MUST correspond to a command/flag that actually exists in the current CLI; references to removed or renamed commands MUST be corrected or removed.
- **FR-005**: The documents MUST be mutually consistent — the same command, flow, and terminology described one way in one document MUST NOT be described contradictorily in another.
- **FR-006**: The OAuth-via-custom-Azure-AD-application flow MUST be documented coherently across the relevant docs (what the custom application is for, how login uses it, and the relevant flags/environment variables), with working cross-links.
- **FR-007**: Deprecated-but-still-present commands MUST be labelled as deprecated with their recommended replacement, rather than removed or presented as primary.
- **FR-008**: The change MUST be documentation-only — no source code, command behaviour, or CLI flags are altered as part of this work.
- **FR-009**: Any internal documentation cross-links touched MUST resolve to existing files/anchors.

### Key Entities

- **Authentication documents**: the set of docs describing how to authenticate — at minimum `README.md` (summary), `docs/commands.md` (command reference), `docs/authentication.md` (full guide), and `docs/oauth-app-registration.md` (custom Entra app registration). These are the artefacts brought into a consistent, accurate state.
- **Authentication command surface**: the actual set of CLI auth commands and flags the docs must match — `azdo auth login` (with OAuth default, `--device-code`, `--use-pat`, and related flags), bare `azdo auth` (legacy PAT-prompt alias), `azdo auth status`, `azdo auth logout`, and the deprecated `azdo clear-pat`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader starting from the README can identify the supported sign-in command (`azdo auth login`, OAuth default) without consulting source code — the previously reported "login is not supported" conclusion is no longer reachable from the entry-point docs.
- **SC-002**: 100% of authentication commands and flags referenced across the documentation correspond to commands/flags that exist in the current CLI (zero references to removed/renamed commands).
- **SC-003**: There are zero contradictions between authentication documents for any command, flag, or flow that appears in more than one of them.
- **SC-004**: All internal cross-links within the touched authentication docs resolve to an existing file/anchor (zero broken links introduced).
- **SC-005**: No source files (CLI commands, flags, behaviour) are modified — the diff is limited to documentation.

## Clarifications

### Session 2026-05-29

- Q: `azdo auth login` is implemented on `develop` (added by #37, commit `ff80f2c`) but is **not yet in any released tag** (latest release `0.10.1` predates it; the released binary's `azdo auth` has only `status`/`logout`). How should the docs treat this unreleased command? → A: **Option A** — sync the docs to the current `develop` auth surface as-is (document `azdo auth login`/OAuth as current), with **no per-release version caveat**. Login reaches users when the next release is cut; cutting that release is out of scope for this docs issue. [owner: alkampfergit, 2026-05-29]

## Assumptions

- "The document" in the issue refers to the authentication documentation set as a whole, not a single file; the entry-point docs (README, command reference) are the primary stale artefacts, with `docs/authentication.md` already largely accurate.
- `docs/authentication.md` is treated as the most current source of truth and is adjusted only where a genuine drift from the actual implementation is found during verification.
- The current implemented auth surface (per the source) is: `azdo auth login` (OAuth default; `--device-code`, `--use-pat`, `--client-id`, `--tenant-id`, `--scopes`, `--from-stdin`, `--no-browser`), bare `azdo auth` (legacy PAT-prompt back-compat alias), `azdo auth status`, `azdo auth logout` (`--all`), and the deprecated `azdo clear-pat`.
- No new documentation pages are required; the work is correcting and reconciling existing ones (adding a missing command row/section is in scope, but creating new guides is not).
