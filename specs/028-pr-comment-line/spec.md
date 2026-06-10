# Feature Specification: PR Comment Line Number Display

**Feature Branch**: `028-pr-comment-line`
**Created**: 2026-06-10
**Status**: Draft
**Issue**: #61

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View line numbers in human-readable output (Priority: P1)

A developer runs `azdo pr comments` (with or without filters) and wants to
know not only which file a code comment is anchored to, but exactly which line
— so they can jump straight to that location in their editor without guessing.

**Why this priority**: The primary ask in the issue. Without the line number
the filename alone forces manual searching; this is the single change that
delivers most of the value.

**Independent Test**: Run `azdo pr comments` against a PR that has at least
one code-anchored thread. The header line for each code-anchored thread must
display `path/to/file.ext:42` (colon-line-number suffix). Threads with no
file anchor are unchanged.

**Acceptance Scenarios**:

1. **Given** a PR with a code-anchored thread on line 42 of `foo.ts`,
   **When** the user runs `azdo pr comments`,
   **Then** the output includes a line like
   `Thread #69293 [active] foo.ts:42` (line number appended after a colon).

2. **Given** a PR with a general (non-file-anchored) thread,
   **When** the user runs `azdo pr comments`,
   **Then** the thread header displays the same format as today (no colon suffix).

3. **Given** a code-anchored thread where the API returns only a left-side
   (old-file) line position and no right-side position,
   **When** the user runs `azdo pr comments`,
   **Then** the left-side line number is used as the fallback.

4. **Given** a code-anchored thread where the API returns a file path but no
   line position at all,
   **When** the user runs `azdo pr comments`,
   **Then** just the file path is shown (no colon suffix), matching the
   existing behaviour — the display degrades gracefully.

---

### User Story 2 - Access line numbers through JSON output (Priority: P2)

A script or tool consuming `azdo pr comments --json` needs the line number for
each thread so it can correlate comments with source lines without
re-implementing ADO API parsing.

**Why this priority**: Required parity: the issue explicitly asks for line
numbers "also on JSON". Enables downstream automation.

**Independent Test**: Run `azdo pr comments --json`. For a code-anchored
thread with a known line number, the thread object in the JSON output must
contain a numeric `line` field with the correct value. For a general thread
the field must be absent or `null`.

**Acceptance Scenarios**:

1. **Given** a code-anchored thread on line 42,
   **When** the user runs `azdo pr comments --json`,
   **Then** the thread object contains `"line": 42`.

2. **Given** a general thread (no file anchor),
   **When** the user runs `azdo pr comments --json`,
   **Then** the thread object contains `"line": null` (field present,
   value null — keeping a stable JSON shape).

---

### Edge Cases

- Thread with `rightFileStart.line` present → use that value.
- Thread with `rightFileStart` absent but `leftFileStart.line` present → use
  `leftFileStart.line` as the fallback.
- Thread with `threadContext` present (file path known) but no line position
  in either side → `line` is `null`; human output shows only the file path.
- Thread with `threadContext === null` (general thread) → `line` is `null`;
  human output unchanged.
- `--code-related-only` and `--hide-resolved` filters: line numbers appear on
  all threads that pass the filter, regardless of which filters are active.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When displaying a code-anchored thread in human-readable output,
  the system MUST append `:N` (colon + integer) after the file path, where `N`
  is the line number, when a line position is available.
- **FR-002**: The system MUST use `rightFileStart.line` as the primary source
  of the line number; if absent, fall back to `leftFileStart.line`.
- **FR-003**: When no line position is available for a code-anchored thread,
  the system MUST show only the file path (no colon suffix), preserving the
  current behaviour.
- **FR-004**: When outputting JSON, each thread object MUST include a `line`
  field: a positive integer when a line number is known, or `null` otherwise.
- **FR-005**: General threads (no file anchor) MUST be unaffected in both
  human and JSON output, except that JSON gains `"line": null` for shape
  consistency.
- **FR-006**: All existing flags (`--hide-resolved`, `--exclude-resolved`,
  `--code-related-only`, `--json`, `--pr-number`) MUST continue to function
  identically.
- **FR-007**: The default output (no flags) MUST remain byte-for-byte
  compatible with the prior release except for the addition of `:N` on
  code-anchored thread headers where line data is now available.

### Key Entities

- **ThreadContext**: The per-thread file/position anchor returned by the ADO
  API. Carries `filePath`, `rightFileStart { line, offset }`,
  `rightFileEnd`, `leftFileStart { line, offset }`, `leftFileEnd`.
- **ActiveCommentThread** (internal): The mapped thread shape used throughout
  the CLI. Gains a `line: number | null` field alongside the existing
  `threadContext: string | null` (file path).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every code-anchored comment thread whose ADO API response
  includes a line position, the human-readable output displays `:N` after the
  file path. Zero regressions on threads that lack a line position.
- **SC-002**: `azdo pr comments --json` output for any thread includes a
  `line` field. All existing JSON fields are preserved.
- **SC-003**: Existing unit tests pass without modification. New unit tests
  cover: (a) right-side line present, (b) right-side absent / left-side
  present, (c) no line position, (d) general thread.
- **SC-004**: `npm run lint && npm test && npm run build` exits 0 on the
  feature branch.
- **SC-005**: No change to the output of any command other than
  `azdo pr comments` (and its JSON variant).

---

## Assumptions

- The ADO `threads` REST endpoint already returns `threadContext.rightFileStart`
  and `threadContext.leftFileStart`; the CLI is simply discarding them during
  mapping. No new API call is required.
- Line numbers are 1-based integers as supplied by the ADO API.
- The `offset` (column) field is intentionally out of scope; only `line` is
  displayed.
