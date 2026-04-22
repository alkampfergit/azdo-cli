# Feature Specification: Secure PAT Storage and `auth` Command

**Feature Branch**: `016-pat-secure-storage`
**Created**: 2026-04-22
**Status**: Draft
**Input**: User description: "Add the ability to store securely the PAT. When no PAT is found in an environment variable, guide the user through obtaining one via a browser and store it in the OS-native secret vault (Windows Credential Manager, macOS Keychain, Linux libsecret). Add an `auth` command that performs this flow."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — First-time interactive setup with secure storage (Priority: P1)

A CLI user has no Personal Access Token (PAT) configured. They run `azdo auth` and are guided to obtain a PAT (existing or newly created on the Azure DevOps website) and paste it into the tool. The tool validates the PAT against Azure DevOps and stores it in the operating-system's native secret vault. Subsequent `azdo` commands automatically pick up the stored PAT without the user re-entering it.

**Why this priority**: This is the core value of the feature. Without this story, the feature does not exist. It unblocks every user who currently has to manually export an environment variable before each session and eliminates the risk of the PAT leaking into shell history, dotfiles, or CI logs.

**Independent Test**: On a clean machine (no `AZURE_DEVOPS_EXT_PAT` / equivalent env var, no prior stored credential), run `azdo auth`, complete the flow, then run any authenticated `azdo` command — it must succeed without re-prompting and without any env var set.

**Acceptance Scenarios**:

1. **Given** no PAT is in an environment variable and no PAT is stored in the OS vault, **When** the user runs `azdo auth` and completes the flow by pasting a valid PAT, **Then** the tool confirms the PAT works against Azure DevOps and reports that it has been stored in the OS vault.
2. **Given** a PAT has been stored via `azdo auth`, **When** the user runs any authenticated `azdo` command in a new shell session with no PAT env var, **Then** the command authenticates successfully using the stored PAT.
3. **Given** the user pastes an invalid PAT during `azdo auth`, **When** the tool validates it against Azure DevOps, **Then** the tool reports the failure clearly, does NOT store the invalid token, and offers the user the option to retry.

---

### User Story 2 — Browser-assisted PAT creation (Priority: P2)

A user who does not yet have a PAT runs `azdo auth`. The tool opens the Azure DevOps PAT-creation page in the user's default browser (pre-filled with the recommended scopes where possible) so the user does not have to hunt for the page manually. The user creates the PAT, copies it, returns to the terminal, and pastes it.

**Why this priority**: Reduces friction for first-time users who do not know where to create a PAT. P2 because Story 1 (manual paste) already delivers full value; browser assistance is an ergonomics improvement on top.

**Independent Test**: Run `azdo auth` on a machine with a default browser configured. The Azure DevOps PAT creation page should open automatically. The terminal prompts for the token.

**Acceptance Scenarios**:

1. **Given** the user runs `azdo auth` and selects the "create a new PAT" option, **When** the tool is on a system with a graphical browser, **Then** the tool opens the Azure DevOps PAT-creation URL and instructs the user to paste the resulting PAT.
2. **Given** the user runs `azdo auth` on a headless system (no `$DISPLAY`, no default browser available), **When** the tool cannot open a browser, **Then** the tool prints the URL for the user to open manually elsewhere and continues to accept a pasted PAT.

---

### User Story 3 — Credential management: inspect, rotate, remove (Priority: P3)

A user needs to see whether a stored PAT is in use, rotate it when it's about to expire, or remove it entirely (e.g., decommissioning a shared workstation).

**Why this priority**: Necessary for long-term maintenance but not blocking initial adoption.

**Independent Test**: After storing a PAT via Story 1, run the management subcommands — `azdo auth status` shows the storage location and (masked) PAT metadata (never the full secret); `azdo auth logout` removes the stored PAT and subsequent commands without env var fail with a clear "not authenticated" message.

**Acceptance Scenarios**:

1. **Given** a stored PAT exists, **When** the user runs `azdo auth status`, **Then** the tool reports the storage backend (e.g., "Windows Credential Manager"), the PAT's Azure DevOps organization, and a masked identifier — but never the full PAT value.
2. **Given** a stored PAT exists, **When** the user runs `azdo auth logout`, **Then** the tool removes the PAT from the OS vault and confirms removal.
3. **Given** a stored PAT exists, **When** the user runs `azdo auth` again, **Then** the tool prompts before overwriting the existing credential.

---

### Edge Cases

- What happens when the PAT env var and a stored PAT are both present? (See FR-009 — env var wins; behavior is explicit, not silent.)
- What happens on Linux systems where libsecret / the D-Bus secret service is not installed (minimal containers, headless CI)? (See FR-010 — the tool reports the unsupported backend clearly and does NOT fall back to a plaintext file.)
- What happens if the OS vault is locked (macOS Keychain not yet unlocked, Windows user not signed in)? (The tool surfaces the OS prompt or error verbatim rather than silently failing.)
- What happens if the PAT is revoked server-side between `auth` and the next command? (The tool reports a clear authentication-failed error and suggests `azdo auth` to re-authenticate; it does NOT delete the stored PAT automatically — the user decides.)
- What happens when the user pipes a PAT into stdin (scripted setup)? (See FR-011 — non-interactive paste must be supported so automation is possible.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tool MUST expose a new command `azdo auth` that orchestrates obtaining and storing a PAT.
- **FR-002**: `azdo auth` MUST accept a PAT via interactive paste (terminal input, masked) from the user.
- **FR-003**: The tool MUST validate a freshly supplied PAT against Azure DevOps before storing it and MUST NOT store an invalid PAT.
- **FR-004**: The tool MUST store the PAT in the operating-system's native secret vault: Windows Credential Manager on Windows, Keychain on macOS, and libsecret (D-Bus secret service) on Linux. The stored value MUST NOT be readable as plaintext from the filesystem.
- **FR-005**: Authenticated `azdo` commands MUST, when no PAT env var is set, transparently retrieve the PAT from the OS vault and use it.
- **FR-006**: The tool MUST offer, as part of `azdo auth`, an option to open the Azure DevOps PAT-creation page in the user's default browser. When a browser cannot be opened, the tool MUST print the URL instead.
- **FR-007**: The tool MUST provide `azdo auth status` to report the presence, storage backend, and non-sensitive metadata of a stored PAT; the command MUST NOT print the PAT value.
- **FR-008**: The tool MUST provide `azdo auth logout` to remove the stored PAT from the OS vault.
- **FR-009**: Environment-variable PAT MUST take precedence over stored PAT. When both are present, the env var is used and the tool MAY emit a single non-fatal notice to `stderr`.
- **FR-010**: When the OS secret backend is unavailable (e.g., Linux without libsecret, CI container without D-Bus), `azdo auth` MUST fail with a clear diagnostic message explaining the missing dependency; it MUST NOT fall back to plaintext file storage.
- **FR-011**: `azdo auth` MUST accept a PAT supplied non-interactively (e.g., piped via stdin or a dedicated flag) so automated provisioning is possible.
- **FR-012**: The tool MUST support storing one PAT per Azure DevOps organization (multi-org scope). Each stored credential is keyed by the organization identifier, and the tool MUST be able to hold credentials for multiple organizations simultaneously without conflict. How the target organization is identified at `azdo auth` time and at subsequent command invocation time will be resolved in the clarify phase (see `## Clarifications` below).
- **FR-013**: On PAT creation/update/removal, the tool MUST log a timestamped audit event (local only) containing the storage backend, the Azure DevOps organization (if applicable), and a masked identifier — never the full PAT.

### Key Entities

- **Stored Credential**: represents a single stored PAT, scoped to one Azure DevOps organization. Attributes: storage backend (Windows CM / macOS Keychain / libsecret), Azure DevOps organization identifier (required key — see FR-012), creation/last-updated timestamp, opaque service/account key used to index into the OS vault. Multiple Stored Credentials may coexist (one per org). Does NOT persist the PAT value itself in any file managed by the tool; the PAT is held only in the OS vault.
- **Auth Session**: transient — the decrypted PAT pulled from the OS vault for the duration of a single CLI invocation. Never persisted to disk by the tool.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can go from "no PAT anywhere" to successfully running an authenticated `azdo` command in under 3 minutes on a supported platform (Windows/macOS/Linux with libsecret).
- **SC-002**: Zero plaintext PAT values are written to any file managed by the tool across all supported platforms. Verified by automated test and by filesystem inspection after running the full `azdo auth` flow.
- **SC-003**: On second and subsequent shell sessions (env var unset, PAT previously stored), authenticated commands succeed without re-prompting the user in 100% of test runs across all three platforms.
- **SC-004**: When the OS secret backend is unavailable, `azdo auth` exits non-zero with a single-line diagnostic identifying the missing dependency in 100% of cases (no silent fallback, no plaintext file created).
- **SC-005**: `azdo auth logout` leaves no residual PAT readable via the OS vault's CLI (`security find-generic-password` on macOS, `cmdkey /list` on Windows, `secret-tool lookup` on Linux).

## Assumptions

- **PAT remains the primary authentication mechanism.** The issue body explicitly states PAT is preferred over OAuth because of fine-grained scoping (work items, builds, etc.). `/speckit-plan` will document the PAT-vs-OAuth trade-off and confirm PAT; OAuth device-code flow is deferred to a future feature.
- **Supported platforms are Windows, macOS, and Linux with libsecret.** Other Unix-like systems (BSDs, minimal Alpine containers without a secret service) are out of scope for this feature; they are covered by FR-010's explicit-failure mode.
- **Multi-organization support: one PAT per Azure DevOps organization.** Confirmed by owner on 2026-04-22 (see `## Clarifications`). The remaining sub-question — how the target organization is identified at `auth` time and at command time — is pending.
- **The tool will NOT implement its own encryption or secret-storage format.** Storage relies entirely on the OS-provided vault APIs; this keeps the security boundary aligned with the platform's existing user-credential protection.
- **Azure DevOps PAT creation URL structure is stable.** The browser-assist feature (FR-006) depends on the Azure DevOps PAT creation page's URL being navigable by deep link; if Microsoft changes the URL, the browser-assist degrades to "print a URL" per FR-006's headless path.

## Clarifications

- Q: Single-organization vs multi-organization scope — does the feature store one PAT globally, or one PAT per Azure DevOps organization the user interacts with?
  → A: **One PAT per organization (multi-org scope).** [owner: alkampfergit, 2026-04-22]
- Q: *(pending — will be asked in `/speckit-clarify`)* How is the target organization identified at `azdo auth` time and at subsequent command invocation time? Options include: a working-context setting, an explicit `--org` flag, an interactive pick, or a combination.

## Out of Scope

- OAuth 2.0 / OIDC device-code authentication (deferred).
- Machine-to-machine / service-principal authentication flows.
- Shared-credential / team-credential synchronization across machines.
- Encrypted file-based fallback when the OS vault is unavailable (explicitly rejected — see FR-010).
- GUI / systray tools for credential management.
