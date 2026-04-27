# Feature Specification: OAuth login for azdo-cli

**Feature Branch**: `018-oauth-login`
**Created**: 2026-04-27
**Status**: Draft
**Input**: User description: "Use OAUTH to simplify login. Currently we support Personal Access Token via an auth helper. Explore standard OAuth so the CLI can open a browser, obtain authorization, and persist the credential in the OS credential store. Goal: avoid forcing the user to generate a PAT. Also document the minimum PAT scopes the CLI requires when PAT remains in use."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One-command browser login (Priority: P1)

A new azdo-cli user wants to authenticate against an Azure DevOps organization without going to the AzDO web UI to manually mint a Personal Access Token. They run a single login command, a browser tab opens, they confirm the authorization, and the CLI is logged in for that organization. The credential is persisted in the operating system's secure credential store so subsequent commands work without re-prompting.

**Why this priority**: This is the headline feature. Today every new user is forced into a PAT-creation detour through the AzDO web UI before they can run any command — that is the experience the issue exists to fix. Without P1, the feature delivers no value.

**Independent Test**: On a clean machine with no existing credential, run the login command, complete the browser authorization, then run any read command (e.g. list pull requests, list work items) against the authorized organization. The command must succeed without prompting for a token. Restart the shell — the same command must still succeed (credential persisted across processes).

**Acceptance Scenarios**:

1. **Given** a new user with no stored credential for organization `O`, **When** they run the OAuth login command targeting `O`, **Then** a browser opens with the AzDO authorization URL and, after the user grants consent, the CLI reports a successful login and persists the credential in the OS credential store.
2. **Given** a user who has just completed an OAuth login, **When** they run any authenticated CLI command in the same shell or a new shell session, **Then** the command authenticates without re-prompting and without re-opening the browser.
3. **Given** a user with a stored OAuth credential whose access token has expired but whose refresh token is still valid, **When** they run an authenticated CLI command, **Then** the CLI silently obtains a new access token and the command succeeds without user interaction.

---

### User Story 2 - Headless / no-browser environment (Priority: P2)

A user on a server, container, or remote SSH session without a usable browser still needs to authenticate. They run the same login command, the CLI detects the absence of a browser (or they pass an explicit flag), and the CLI presents an alternate flow that does not require a local browser to be available — typically a short user code displayed in the terminal that the user types into a different device's browser.

**Why this priority**: Many azdo-cli users run the tool from CI runners, dev containers, or remote hosts. Without a headless path, those users are forced to keep using PATs even after the OAuth feature ships, which significantly weakens the "avoid forcing PAT generation" goal.

**Independent Test**: On a host with no `BROWSER` / `DISPLAY` available (or with the explicit headless flag), run the login command. Confirm that the CLI outputs a code + URL pair, that completing the flow on a separate device authorizes the host, and that subsequent commands authenticate.

**Acceptance Scenarios**:

1. **Given** the user is on a headless host, **When** they run the login command, **Then** the CLI displays a short user code and a verification URL and polls until the user completes the authorization on a separate device, after which the credential is persisted on the headless host.
2. **Given** the user explicitly requests the headless flow on a host that does have a browser, **When** they run the login command with the headless flag, **Then** the CLI uses the user-code flow regardless of browser availability.

---

### User Story 3 - PAT remains a documented option (Priority: P3)

A user (corporate environment, restricted network, automation pipeline, or personal preference) cannot or does not want to use OAuth. They must still be able to authenticate with a PAT, and the documentation must clearly state the minimum PAT scopes the CLI requires for the operations it currently exposes — so the user can mint the smallest sufficient PAT instead of an over-scoped one.

**Why this priority**: PAT support already exists; this story is about preserving it as a deliberate, documented option (not an undocumented fallback), and shipping the scope list the issue explicitly asked for. It is P3 because no new code is required for the auth path itself — the deliverable is documentation plus a small UX tweak so the OAuth path does not silently break PAT users.

**Independent Test**: Read the published documentation. Confirm it (a) lists the supported authentication methods including PAT, (b) lists the exact minimum PAT scopes required for each major CLI capability area, and (c) explains how to configure the CLI to use PAT instead of OAuth. A user following only the documentation must be able to mint a correctly-scoped PAT and log in.

**Acceptance Scenarios**:

1. **Given** the user reads the login documentation, **When** they look for required PAT scopes, **Then** they find an unambiguous, capability-by-capability scope table.
2. **Given** the user has a valid PAT with the documented scopes, **When** they run the PAT login command, **Then** authentication succeeds and the PAT is persisted in the OS credential store on the same footing as an OAuth credential.
3. **Given** the OAuth feature has shipped, **When** an existing PAT user upgrades the CLI, **Then** their existing PAT-based login continues to work without any forced migration.

---

### Edge Cases

- **Browser does not open** (no default browser configured, sandboxed environment): the login command must surface a clear error and offer the headless fallback rather than hanging.
- **Local callback port already in use**: the CLI must either pick an alternate port or fail with a descriptive message; it must never silently bind to a different port and accept tokens from an unrelated source.
- **User cancels the consent dialog in the browser** or closes the tab: the CLI must time out with a clear message instead of waiting forever.
- **Stored refresh token is rejected** (revoked, expired beyond the refresh window, organization disabled): the CLI must prompt for a fresh login rather than retrying silently.
- **Multiple Azure DevOps organizations**: a user authenticated against organization `A` runs a command against organization `B`. The behaviour must be unambiguous — either an explicit per-org credential model or a clear error directing the user to log in for `B`.
- **OS credential store unavailable** (Linux without a running secret service, locked keychain): the CLI must report the storage failure rather than silently falling back to plaintext on disk.
- **Logout / credential rotation**: a logout command must remove the stored credential for the targeted organization without affecting unrelated stored credentials.
- **Concurrent CLI invocations during token refresh**: two parallel CLI processes hitting an expired token must not corrupt the stored credential (one refresh wins, the other re-reads).
- **Clock skew on the user's machine**: the CLI must tolerate moderate skew when validating token expiry rather than refusing valid tokens.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The CLI MUST provide an OAuth login command that, when invoked on a host with a usable browser, opens the default browser at the Azure DevOps authorization URL and completes the authorization without requiring the user to manually create or paste a Personal Access Token.
- **FR-002**: The CLI MUST persist the resulting credential (access token and, when issued, refresh token, plus the metadata needed to identify the organization and account) in the host operating system's secure credential store — Windows Credential Manager on Windows, Keychain on macOS, the freedesktop.org Secret Service (e.g. GNOME Keyring / KWallet) on Linux.
- **FR-003**: The CLI MUST NOT persist OAuth credentials in plaintext files on disk under any circumstance; if the OS credential store is unavailable, the CLI MUST fail the login with a descriptive error rather than silently downgrading.
- **FR-004**: The CLI MUST automatically refresh the access token using the stored refresh token (when refresh is possible) the next time an authenticated command runs against an expired access token, with no user interaction required.
- **FR-005**: The CLI MUST provide a headless authentication path (device-code-style flow: short user code plus verification URL displayed in the terminal, polled by the CLI) for hosts without a usable browser, selectable automatically when no browser is detected and explicitly via a flag.
- **FR-006**: The CLI MUST provide a logout command that removes the stored credential for a specified organization (or for all organizations) from the OS credential store and does not affect unrelated stored credentials.
- **FR-007**: The CLI MUST continue to accept Personal Access Token authentication as a deliberate, supported alternative to OAuth — existing PAT users MUST NOT be force-migrated and MUST be able to opt into PAT on a fresh install via the explicit `--use-pat` flag on the auth command. OAuth and PAT MUST coexist as first-class authentication methods.
- **FR-007a**: Credential resolution at command-execution time MUST follow this precedence and MUST be format-aware: (a) check the documented PAT environment variable first — if present, use it as a PAT; (b) otherwise, look up the stored credential for the target organization in the OS credential store. The stored credential record MUST carry an explicit kind marker so the CLI can tell a PAT from an OAuth-issued token and treat each correctly (PATs are used as-is; OAuth tokens may need silent refresh per FR-004).
- **FR-008**: The published CLI documentation MUST contain a capability-by-capability table listing the minimum Azure DevOps PAT scopes required for each operation area the CLI exposes (initial known scope: Work Items read/write and Code read for Pull Requests), so a user can mint a least-privilege PAT.
- **FR-009**: The CLI MUST support being authenticated against multiple Azure DevOps organizations simultaneously, with each organization's credential isolated in the OS credential store; commands targeting an organization the user is not authenticated against MUST fail with a clear "log in to `<org>`" message rather than silently using a different organization's credential.
- **FR-010**: The CLI MUST surface clear, actionable errors for the documented edge cases (browser failure, callback port conflict, user cancellation / timeout, refresh-token rejection, credential-store failure) — never an indefinite hang and never a generic stack trace.
- **FR-011**: The OAuth login flow MUST validate that the credential it received corresponds to the authorization request it initiated (i.e. it must be safe against a malicious local process attempting to inject an unrelated authorization response on the callback channel).
- **FR-012**: The OAuth flow MUST be the default for the auth command. PAT-based authentication MUST be opt-in via an explicit `--use-pat` flag. Resolved on issue #37 by the owner on 2026-04-27.
- **FR-013**: [NEEDS CLARIFICATION: Which Azure DevOps OAuth client model is in scope — a single public OAuth application registered by the project that all azdo-cli installations share, OR a model where each user / organization registers their own AzDO OAuth application and configures the CLI with its client id? This is a scope and security decision and gates a lot of the implementation.]
- **FR-014**: [NEEDS CLARIFICATION: When a stored OAuth credential's refresh path fails (token revoked, refresh window exceeded, organization access removed), should the CLI silently delete the dead credential and prompt for a new login on the next command, OR keep the dead credential and surface an error every time until the user runs an explicit `login` / `logout`?]

### Key Entities *(include if feature involves data)*

- **Stored credential**: A record persisted in the OS credential store, identified by the Azure DevOps organization it grants access to. Carries: credential kind (OAuth or PAT), opaque access token, optional opaque refresh token, expiry timestamp (for OAuth), the authenticated account identifier, and the issuance metadata needed to refresh. The CLI never logs or displays the token value.
- **Organization context**: The Azure DevOps organization a CLI command is targeting. Resolved from the user's invocation (explicit flag, current working configuration, or default). Used to look up which stored credential — if any — to attach to the request.
- **Authorization session (transient)**: An in-flight OAuth login attempt. Lives only for the duration of the login command. Carries the request state needed to validate the callback and the timeout policy. Discarded once the credential is persisted (or the attempt fails).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user with no prior PAT can authenticate against an Azure DevOps organization in under 2 minutes from running the login command for the first time, without ever opening the AzDO web UI to create a token.
- **SC-002**: After the feature ships, the share of new-user setup support requests / issues that mention "PAT" or "Personal Access Token" drops by at least 50% compared with the equivalent window before the feature.
- **SC-003**: 95% of OAuth login attempts (excluding genuine user cancellations and network failures) complete successfully on the first try without falling back to a manual workaround.
- **SC-004**: After an authenticated user idles past the access-token lifetime, the very next CLI command succeeds via silent refresh in under 5 seconds with no user interaction, in at least 95% of cases where the refresh token is still valid.
- **SC-005**: The published documentation lists the minimum required PAT scope for every CLI capability area; a user reading only the documentation can mint a least-privilege PAT and complete PAT login on the first attempt.
- **SC-006**: No OAuth or PAT credential is ever written to a plaintext on-disk location by the CLI; this is verifiable by an external observer running the login flow and inspecting the user's home directory and the CLI's working directory afterwards.

## Clarifications

- Q: Should OAuth become the default `azdo login` flow, with PAT opt-in via a flag, OR should PAT remain the default and OAuth be opt-in? → A: OAuth is the default; PAT is opt-in via `--use-pat`. The two coexist as first-class methods. Credential resolution at runtime checks the PAT env var first, then the OS credential store, and the stored record carries an explicit kind marker so the CLI can tell PAT from OAuth-issued tokens. [owner: alkampfergit, 2026-04-27]

## Assumptions

- "Azure DevOps OAuth" refers to the OAuth flow Azure DevOps itself supports for third-party applications; the exact provider mechanics (Microsoft Entra vs the legacy AzDO OAuth surface) is a planning-phase decision and does not change the user-visible spec.
- The CLI's existing PAT-based login command and credential storage path remain the reference for "what working auth looks like"; OAuth is added alongside, not as a rip-and-replace.
- "Open the browser" means the host's default browser via the standard OS handler; the CLI is not expected to embed or ship a browser.
- The OS credential stores listed (Windows Credential Manager, macOS Keychain, freedesktop Secret Service on Linux) are the supported set; users on platforms outside this set fall back to the headless flow plus a documented manual workaround, which is deliberately out of scope here.
