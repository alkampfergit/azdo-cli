# SonarCloud Issue Patterns

Last updated: 2026-06-05

## Rules encountered

### S5852 - Regex vulnerable to super-linear runtime
- **File**: `src/commands/get-item.ts`
- **Fix**: Replaced the fallback HTML tag stripping regex with a linear character
  scan helper to avoid backtracking on malformed tag input while preserving
  existing output
- **Issue**: `azdo-cli-4sl`

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

### S3863 - Same module imported multiple times
- **Files**: git-remote.test.ts, azdo-client.test.ts
- **Pattern**: When tests add new features, a second `import { newFn }` for the same module is appended mid-file rather than added to the top-of-file block
- **Fix**: Merge ALL imports from the same module into one statement at the top of the file (value imports + type imports can stay on separate lines)
- **Commit**: 8d18d2e

### S4323 - Inline union type repeated across multiple signatures
- **Files**: src/commands/config.ts, src/services/config-store.ts
- **Pattern**: `string | string[] | boolean | undefined` typed inline in function signatures
- **Fix**: Define `export type ConfigValue = string | string[] | boolean | undefined` in `src/types/work-item.ts` and use it everywhere
- **Commit**: 8d18d2e

### S4325 - Unnecessary type assertion
- **Files**: src/commands/config.ts (as ScopedSettings), tests/unit/config-store.test.ts (as CliConfig x12)
- **Pattern**: `as T` casts where TypeScript already infers the correct type. Common when new code is added cautiously or when all CliConfig fields are optional
- **Fix**: Remove the `as T`. If TypeScript then complains, the issue is in the caller — fix there. For test objects, since CliConfig is all-optional, partial literals are assignable without casting
- **Commit**: 8d18d2e

### S6557 - Use String#startsWith / String#endsWith
- **Files**: src/services/git-remote.ts
- **Pattern**: `/^prefix/.test(str)` or `str.indexOf('x') === 0` instead of `str.startsWith('x')`
- **Fix**: Mechanical replacement — `str.startsWith('x')`
- **Commit**: 8d18d2e

### S7735 - Negated condition
- **Files**: src/services/git-remote.ts
- **Pattern**: `a !== b ? x : y` where the positive branch is harder to read
- **Fix**: Flip to `a === b ? y : x`
- **Commit**: 8d18d2e

### S7744 - Spreading a useless empty object `{}`
- **Files**: src/services/config-store.ts (3 instances)
- **Pattern**: `{ ...(obj ?? {}), key: val }` — the `?? {}` is redundant because `{ ...undefined }` === `{}` in JS/TS
- **Fix**: `{ ...obj, key: val }` — spreading undefined is a no-op; TypeScript allows it when the type is `T | undefined`
- **Commit**: 8d18d2e

### S3776 - Cognitive complexity too high
- **Files**: src/services/git-remote.ts (parseAllAzdoRemotes: 18→7), src/services/azdo-client.ts (getWorkItem: 21→6)
- **Pattern**: Large functions with nested try/catch, nested for loops, or many conditional branches
- **Fix strategy**:
  1. For nested loops: extract inner loop + body into `matchXxx()` helper returning `T | null`
  2. For outer loop boilerplate: extract `parseOneLine()` returning parsed value or `null`
  3. For try/catch with business logic: extract `fetchWithFallback()` returning `{ data, effectiveFields }`
  4. For description building with multiple if/push: extract `buildCombinedDescription(fields)` returning `string | null`
- **Commit**: 8d18d2e

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
