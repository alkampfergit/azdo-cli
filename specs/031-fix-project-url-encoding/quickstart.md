# Quickstart: Fix URL Percent-Encoding for ADO Project Names with Spaces

## What changes

**One source file** with two one-line fixes and a two-line helper:

```
src/services/git-remote.ts   ← add decodePctSegment(); apply in matchAzdoRemote + parseAzdoRemote
```

**One test file** with one updated assertion and five new test cases:

```
tests/unit/git-remote.test.ts
```

## How to verify

```bash
# Run only the unit tests (fast — no network needed)
npm run test:unit

# Run full suite (lint + type check + unit + build)
npm test
```

## Expected behaviour after fix

| Remote URL | project (before) | project (after) |
|---|---|---|
| `https://dev.azure.com/org/Course%20Examples%20Builds/_git/repo` | `Course%20Examples%20Builds` | `Course Examples Builds` |
| `https://dev.azure.com/org/My%20Project/_git/repo` | `My%20Project` | `My Project` |
| `https://dev.azure.com/org/SimpleProject/_git/repo` | `SimpleProject` | `SimpleProject` (unchanged) |

## Key constraint

The `FROZEN_BASELINE` array in `tests/unit/fixtures/git-remote.cases.ts` must not be regenerated — it is a regression anchor. The new tests add to it; they do not replace it.
