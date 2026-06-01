# Feature Specification: Check for new stable version on startup

**Feature Branch**: `022-version-update-check`  
**Created**: 2026-06-01  
**Status**: Draft  
**Input**: User description: "Check for a new stable version on startup. When the user executes commands, azdo should check npm for a newer published stable version of the tool. Persist the last-check timestamp in a temp file so that no more than one check is performed every 10 minutes. The check must be the quickest possible and must not block or slow down normal command execution. If a newer stable version is available, inform the user. Source issue: alkampfergit/azdo-cli#47."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Notified when a newer stable version exists (Priority: P1)

A user runs any `azdo` command from a version that is no longer the latest published stable release. After the command does its normal work, the user sees a short, unobtrusive notice that a newer stable version is available, along with how to upgrade. The notice never replaces, corrupts, or delays the command's own output.

**Why this priority**: This is the core value of the feature — keeping users aware that an update exists so they can pick up fixes and improvements. Without it, the feature delivers nothing.

**Independent Test**: With the local tool pinned to an older version number and the registry reporting a newer stable version, run any command and confirm a single upgrade notice appears after the command output, and that the command's own result is unchanged.

**Acceptance Scenarios**:

1. **Given** the installed tool is older than the latest published stable version, **When** the user runs any command, **Then** the command completes normally and an upgrade notice naming the newer version is shown afterwards.
2. **Given** the installed tool is already at (or ahead of) the latest published stable version, **When** the user runs any command, **Then** no upgrade notice is shown.
3. **Given** a newer version exists only as a pre-release/beta, **When** the user runs any command, **Then** no upgrade notice is shown (only stable releases trigger a notice).

---

### User Story 2 - Check is throttled and never slows commands down (Priority: P1)

A user runs many `azdo` commands in quick succession (including in scripts). The tool must not perform a registry lookup on every invocation, and must never make the user wait on the network. At most one registry check happens per 10-minute window; all other invocations rely on the cached result.

**Why this priority**: The issue explicitly requires the check to be the quickest possible, to not block command execution, and to run at most once per 10 minutes. A version check that slows down or stalls the CLI is worse than no check at all.

**Independent Test**: Run a command, then run a second command within 10 minutes; confirm only one registry lookup occurred (second invocation used the cache). Simulate a slow/unreachable registry and confirm command latency is unaffected and the command still succeeds.

**Acceptance Scenarios**:

1. **Given** a registry check ran less than 10 minutes ago, **When** the user runs another command, **Then** no new registry lookup is performed and the cached result is used.
2. **Given** the last registry check was more than 10 minutes ago (or never), **When** the user runs a command, **Then** at most one new registry lookup is performed and the new timestamp/result is persisted.
3. **Given** the registry is slow or unreachable, **When** the user runs a command, **Then** the command completes without added delay and no error is surfaced to the user.

---

### User Story 3 - Quietly degrades and can be turned off (Priority: P2)

A user in a constrained environment (offline, air-gapped, CI pipeline, or simply not wanting the notice) is never blocked, never sees errors from the check, and can suppress the behaviour entirely.

**Why this priority**: Keeps the feature safe and non-intrusive across all environments. Important for trust, but secondary to the check itself working.

**Independent Test**: Set the opt-out control and confirm no registry lookup happens and no notice is shown. Run with no network and confirm commands behave exactly as before the feature existed.

**Acceptance Scenarios**:

1. **Given** the opt-out control is set, **When** the user runs a command, **Then** no registry lookup and no upgrade notice occur.
2. **Given** the cache file is missing, unreadable, or corrupt, **When** the user runs a command, **Then** the tool treats it as "no recent check", does not crash, and the command succeeds.

---

### Edge Cases

- **Registry unreachable / timeout / offline**: the check fails silently; the command is unaffected and no error is shown. The failed attempt still updates the throttle timestamp so the tool does not retry on every subsequent command. [NEEDS CLARIFICATION: should a *failed* check reset the 10-minute throttle the same as a successful one, or should it be retried sooner?]
- **Corrupt or partially written cache file**: treated as no recent check; overwritten on the next successful check.
- **Concurrent invocations**: two commands started at nearly the same time must not corrupt the cache or produce duplicate prolonged checks; worst case is two lookups, never a crash.
- **Pre-release / tagged versions**: only the latest *stable* release counts; pre-releases are ignored.
- **Development / local builds** (running an unpublished or `0.0.0`-style version): no misleading "downgrade" notice should be shown.
- **Non-interactive / CI execution**: [NEEDS CLARIFICATION: should the upgrade notice be automatically suppressed when output is not a terminal or when a CI environment is detected, to avoid polluting scripted/CI output?]
- **Notice frequency**: because checks are throttled to once per 10 minutes, the notice is shown at most once per 10-minute window. [NEEDS CLARIFICATION: within a window where a newer version is known, should the notice appear on every command or only once until dismissed/upgraded?]

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tool MUST, as part of normal command execution, determine whether a newer stable published version of itself is available.
- **FR-002**: The tool MUST perform at most one registry lookup per 10-minute window, using a persisted record of the last check to enforce this.
- **FR-003**: The tool MUST persist the last-check information in a temporary/cache location so the throttle survives across separate command invocations.
- **FR-004**: The version check MUST NOT block, delay, or otherwise slow down the command the user actually invoked; the user's command and its output take priority.
- **FR-005**: When a newer stable version is detected, the tool MUST inform the user with a short notice that names the available version and indicates how to upgrade.
- **FR-006**: The tool MUST only consider stable releases when deciding whether to notify; pre-release/beta versions MUST NOT trigger a notice.
- **FR-007**: The tool MUST NOT surface any error, stack trace, or warning to the user when the check fails for any reason (network, registry, parsing, file access).
- **FR-008**: The tool MUST behave correctly and without crashing when the cache record is missing, unreadable, or corrupt.
- **FR-009**: The tool MUST provide a way for the user to disable the version-check behaviour entirely. [NEEDS CLARIFICATION: opt-out mechanism — dedicated flag, config setting, environment variable, or a combination?]
- **FR-010**: The tool MUST NOT show a misleading notice when the running version is equal to, or newer than, the latest published stable version (including local/development builds).

### Key Entities *(include if feature involves data)*

- **Last-check record**: the persisted state used to enforce throttling. Conceptually holds when the last check ran and the most recent known latest-stable version. Stored in a temporary/cache location, readable and writable across invocations, and safe to discard at any time.
- **Latest-stable version**: the newest non-pre-release version of the tool published to the registry, compared against the currently running version.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a newer stable version exists and the throttle allows, the user sees exactly one clear upgrade notice naming that version; when the running version is current, no notice appears.
- **SC-002**: No more than one registry lookup occurs within any 10-minute window across repeated command invocations.
- **SC-003**: Added latency to a command from the version-check feature is negligible in the common case and never causes the user to wait on the network — a slow or unreachable registry adds no perceptible delay to command completion.
- **SC-004**: With the registry unreachable or the feature disabled, every command behaves exactly as it did before the feature existed (same exit codes, same output aside from the optional notice), with zero errors attributable to the check.
