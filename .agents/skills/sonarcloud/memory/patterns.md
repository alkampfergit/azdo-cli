# SonarCloud Issue Patterns

Last updated: 2026-03-08

## Rules encountered

### S6551 - Avoid String() on potentially object-typed value
- **File**: Multiple command files
- **Fix**: Use explicit type checks or template literals instead of `String(value)`
- **Commit**: 6229d65

### Duplication - Repeated command boilerplate
- **Files**: assign.ts, get-item.ts, set-field.ts, set-state.ts
- **Pattern**: Each command had identical `resolveContext()`, `parseWorkItemId()`,
  `validateOrgProjectPair()`, and `handleCommandError()` implementations
- **Fix**: Extracted to `src/services/command-helpers.ts` and `src/services/context.ts`
- **Commits**: 78269b4, e54696f

### Duplication - Repeated test patterns
- **Files**: azdo-client.test.ts, html-detect.test.ts, multiple test files
- **Pattern**: Identical mock setups and assertion patterns repeated across tests
- **Fix**: Extracted to `tests/unit/helpers/api-test-utils.ts` and
  `tests/unit/helpers/command-test-utils.ts`, converted to `it.each` patterns
- **Commits**: eed2ee9, 9716df4

## Conflict hotspots

Files that cause merge conflicts when modified by parallel agents:
- `src/index.ts` (9 modifications across branches)
- `src/services/azdo-client.ts` (8 modifications)
- `package.json` (8 modifications)
- `tests/unit/azdo-client.test.ts` (4 modifications)

## Lessons learned

1. **Never use parallel agents for duplication fixes** -- they are inherently
   cross-cutting and touch overlapping files
2. **SonarCloud duplication threshold** applies to new code on the PR diff,
   not the whole codebase
3. **Extracting shared helpers** can itself cause duplication issues if the
   helper is too similar to existing code -- check for existing utilities first
