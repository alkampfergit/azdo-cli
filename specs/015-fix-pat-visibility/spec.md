# Feature Specification: Fix PAT Input Visibility Bug

**Feature Branch**: `015-fix-pat-visibility`  
**Created**: 2026-04-09  
**Status**: Draft  
**Input**: User description: "Fix PAT input visibility bug: when pasting a PAT, the raw characters should never be visible; only the masked version with asterisks should appear"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Secure PAT Entry (Priority: P1)

A user runs an azdo-cli command that requires authentication. They are prompted for a Personal Access Token (PAT). When the user types or pastes the PAT, only the masked version (asterisks with a few visible characters at start and end) appears on screen at all times. The raw PAT characters are never visible, not even momentarily during paste operations.

**Why this priority**: Security — exposing the PAT even briefly on screen risks shoulder-surfing or terminal history capture. This is the core bug to fix.

**Independent Test**: Can be fully tested by running any authenticated azdo-cli command without a stored PAT, pasting a test token, and verifying only the masked display appears.

**Acceptance Scenarios**:

1. **Given** no PAT is stored, **When** the user types the PAT character by character, **Then** only the masked string (e.g., `abcde****efghi`) appears, updating correctly with each keystroke.
2. **Given** no PAT is stored, **When** the user pastes a PAT via clipboard, **Then** the raw PAT characters never appear on screen; only the masked version is shown after the paste completes.
3. **Given** no PAT is stored, **When** the user pastes a PAT, **Then** the masked display appears on the same line as the prompt — not on a new line beneath raw text.
4. **Given** no PAT is stored, **When** the user presses Backspace, **Then** the last character is removed and the masked display updates correctly on the same line.
5. **Given** no PAT is stored, **When** the user presses Enter, **Then** the PAT is accepted and no raw characters were ever displayed.

---

### Edge Cases

- What happens when the user pastes on a non-TTY terminal (piped input)? System returns null gracefully.
- What happens when the pasted PAT contains special characters? All non-control characters are accumulated correctly.
- What happens when the PAT is very short (fewer than 10 characters)? The masking function shows the full string without masking (existing behavior preserved).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The PAT prompt MUST never display raw PAT characters at any point during entry, including during paste operations.
- **FR-002**: The PAT prompt MUST display a masked version (asterisks with a small number of visible characters at start and end) on the same line as the prompt.
- **FR-003**: The masked display MUST update in place on the same line — using carriage return, not newline — so no separate line with raw text can appear above it.
- **FR-004**: The system MUST suppress any echoing of raw input characters from readline or terminal emulation before the masking handler processes them.
- **FR-005**: The backspace and delete keys MUST continue to remove the last character from the in-memory PAT and redraw the masked display correctly.
- **FR-006**: Ctrl+C MUST still cancel the prompt cleanly.
- **FR-007**: Non-TTY environments (piped stdin) MUST be handled gracefully (return null).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At no point during typing or pasting does the raw PAT string appear on the terminal output.
- **SC-002**: The masked PAT display always appears on the same line as the prompt, with no extra lines introduced.
- **SC-003**: The existing behavior for backspace, Enter, and Ctrl+C is preserved exactly.
- **SC-004**: All existing tests for PAT-related functionality continue to pass.

## Assumptions

- [AUTO] Root cause: `createInterface` from Node.js `readline` is created with `output: process.stderr`, causing readline to echo received characters to the terminal independently of the raw-mode `onData` masking handler. When pasting multiple characters simultaneously, readline echoes them all at once before the redraw logic can overwrite the line. Chose to set `output: null` to disable readline's built-in echoing since all output is handled manually via `process.stderr.write`.

## Clarifications

### Session 2026-04-09

- Q: What is the root cause of the raw PAT appearing on a separate line? → A: `createInterface` with `output: process.stderr` causes readline to echo raw keystrokes to stderr independently of the `onData` masking handler. [AUTO: diagnosed from code analysis of src/services/auth.ts]
