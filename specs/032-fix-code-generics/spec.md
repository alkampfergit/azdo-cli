# Feature Specification: Fix Inline Code Span Fidelity for Generic Type Arguments

**Feature Branch**: `032-fix-code-generics`
**Created**: 2026-06-25
**Status**: Draft
**Input**: User description: "Fix set-md-field / get-md-field stripping generic type arguments inside inline code spans."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Round-trip generic types without data loss (Priority: P1)

As a developer using the CLI to document work items with C#/TypeScript/Java generic type signatures
in inline code spans (e.g. `` `Task<HealthCheckResult>` ``, `` `IReadOnlyList<IDocumentStore2Job>` ``),
I want the content I upload with `set-md-field` to come back intact when I read it with `get-md-field`,
so that I can rely on the tool to store and retrieve code documentation accurately.

**Why this priority**: Data loss is a correctness defect. Any content that is silently stripped when
round-tripping undermines trust in the tool and produces misleading documentation in Azure DevOps.
This is the primary bug.

**Independent Test**: Can be fully tested by setting a markdown field containing inline code spans
with angle-bracket generics and reading back the same field; the retrieved content must match the
uploaded content character-for-character inside every code span.

**Acceptance Scenarios**:

1. **Given** a markdown document containing `` `Task<HealthCheckResult>` `` as an inline code span, **When** the field is set via `set-md-field` and then read back via `get-md-field`, **Then** the output contains `` `Task<HealthCheckResult>` `` with the angle-bracket content fully preserved.
2. **Given** a markdown document containing `` `Func<Task<HealthCheckResult>>` `` (nested generics), **When** the field is round-tripped, **Then** all nested angle-bracket content is preserved exactly.
3. **Given** a markdown document containing `` `IReadOnlyList<IDocumentStore2Job>` ``, **When** the field is read back, **Then** the type argument `IDocumentStore2Job` is not stripped.
4. **Given** a markdown document where angle brackets appear in regular prose (not in code spans), **When** the field is read back, **Then** prose content is also preserved without unintended alteration.

---

### User Story 2 - Multi-type-parameter code spans preserved (Priority: P2)

As a developer documenting methods with multiple type parameters (e.g. `` `Dictionary<TKey, TValue>` ``),
I want all type arguments preserved during round-trip so that method signatures are accurately recorded
in work item fields.

**Why this priority**: Multiple type parameters are common in .NET and TypeScript code documentation.
While less critical than single-param generics (covered by P1), their correct handling completes
the fix for the realistic range of generic signatures found in practice.

**Independent Test**: Set a field with `` `Dictionary<TKey, TValue>` `` and read it back; both
`TKey` and `TValue` must appear in the output.

**Acceptance Scenarios**:

1. **Given** `` `Dictionary<TKey, TValue>` `` in a code span, **When** round-tripped, **Then** both `<TKey, TValue>` are present in the output.
2. **Given** `` `Action<T1, T2, T3>` `` in a code span, **When** round-tripped, **Then** all three type arguments are preserved.

---

### Edge Cases

- What happens when a code span contains only angle brackets with no surrounding text (e.g. `` `<T>` ``)? The content must be preserved.
- What happens when the field value returned by ADO already has properly HTML-escaped angle brackets (e.g. entities)? Must not double-escape; output must still be `` `<T>` ``.
- What happens when the markdown contains both inline code with generics and fenced code blocks with generic syntax? Both types of code content must be preserved.
- What if the markdown field contains no generics at all? Existing correct behaviour must not regress.
- What if the markdown contains HTML entity sequences outside of code spans? These must pass through correctly without being corrupted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `get-md-field` MUST return angle-bracket content inside inline code spans exactly as originally uploaded via `set-md-field`, without any characters being silently dropped.
- **FR-002**: The fix MUST preserve generic type arguments for any depth of nesting (e.g. `Func<Task<T>>`), not just the outermost level.
- **FR-003**: The fix MUST handle both single and multiple type parameters (e.g. `Pair<K, V>`).
- **FR-004**: The fix MUST NOT alter content outside of code spans — prose, headings, lists, and links MUST be unaffected.
- **FR-005**: The fix MUST NOT double-encode already-escaped content; fields that round-trip correctly today MUST continue to work.
- **FR-006**: The HTML-to-markdown conversion step MUST produce equivalent output for all existing content types that currently convert correctly (no regressions).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every inline code span containing generic type arguments (single or nested, single or multiple type params) round-trips through `set-md-field` / `get-md-field` with 100% content fidelity — no characters stripped.
- **SC-002**: All existing unit tests for the HTML-to-markdown conversion continue to pass after the fix is applied (zero regressions).
- **SC-003**: A new failing test that reproduces the reported bug (stripping a generic type argument from an inline code span) passes after the fix is applied.
- **SC-004**: Fields containing no generic type arguments are unaffected — their output before and after the fix is identical.

## Assumptions

- ADO may return rich-text field values as HTML containing bare (unescaped) angle brackets inside `<code>` elements, rather than properly HTML-escaped entities. This is the root condition producing the data loss.
- The fix is applied entirely within the client-side HTML→markdown conversion logic; no changes to the ADO API calls or field upload logic are required.
- Existing tests for other HTML conversion scenarios (bold, italic, links, headings, lists) serve as the regression guard and do not need modification.
