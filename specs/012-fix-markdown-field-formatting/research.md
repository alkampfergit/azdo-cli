# Research: Fix Markdown Field Formatting in Get Item Output

**Branch**: `012-fix-markdown-field-formatting`
**Date**: 2026-04-03

## Findings

### Current Behavior Analysis

**Decision**: The bug is in two functions within `src/commands/get-item.ts`:

1. `formatExtraFields` (line 57-63): formats extra fields as `${fieldLabel.padEnd(13)}${displayValue}`. When `displayValue` is multi-line markdown, the first line immediately follows the label with no separator.

2. `summarizeDescription` (line 65-70): formats description summary as `` `${label('Description:')}${firstThree.join('\n')}` ``. The label `Description:` is directly concatenated with the content.

3. In non-short mode (line 101-102): `lines.push('Description:', descriptionText)` — this correctly puts description on a new line after the label because `push` adds two separate elements.

**Rationale**: The existing code in non-short mode already handles description correctly (label on own line, content on next). The bug is specifically in `formatExtraFields` and `summarizeDescription`.

**Alternatives considered**:
- Always put content on new line: rejected because the description explicitly says single-line content should be on the same line.
- Add a fixed separator string: rejected because description says to use `:` after the label name.

### Implementation Approach

**Decision**: Extract a helper function `formatMarkdownFieldValue(label: string, value: string): string` that:
- If `value` is empty or has no newlines: returns `${label}: ${value}` (or just `${label}:` if empty)
- If `value` has newlines: returns `${label}:\n${value}`

Apply this helper in both `formatExtraFields` and `summarizeDescription`.

**Rationale**: Keeps the logic DRY (single implementation of the formatting rule) and makes both call sites consistent.

**Alternatives considered**:
- Inline the logic at each call site: rejected because DRY is better.
- Modify `label()` helper: rejected because `label()` just pads strings and should not embed content-aware logic.

## Autonomous Decisions

- [AUTO] The fix scope is limited to the markdown-enabled path (`markdown=true`). Non-markdown path is unchanged.
- [AUTO] Multi-line detection: `value.includes('\n')` after trimming trailing whitespace.
- [AUTO] Empty value handling: if value is empty string, output `Label:` with nothing after (no trailing space).
- [AUTO] The `padEnd(13)` padding used for non-markdown labels is NOT carried forward in the markdown label display — instead the label is the natural field name followed by `:`. This is consistent with the description requirement.
- [AUTO] For `summarizeDescription` in short mode, the same rule applies: if the joined first three lines contain a newline (which they will if there are multiple lines), the content goes on the next line.
