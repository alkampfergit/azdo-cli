# Data Model — 019-fix-pr-command

The change is presentation-layer (URL recognition, help text, error message, stderr warning). There are no new domain entities, no schema changes, no persisted state, and no transport-level changes (the Azure DevOps API client is untouched). This file documents the **two module-scope state items** introduced by the fix so they are visible at planning time and exercised by Phase 2 tasks.

## E-1 — `AzdoContext` (unchanged)

| Field   | Type     | Source                                  | Notes |
|---------|----------|-----------------------------------------|-------|
| `org`   | `string` | `match[1]` of the matching URL pattern  | Empty string when the URL is the legacy `DefaultCollection` form and the project segment matches `DefaultCollection`. |
| `project` | `string` | `match[2]` of the matching URL pattern | Empty string in the `DefaultCollection` special case (see `git-remote.ts`). |

No new fields; the userinfo prefix is consumed by the regex and never stored on `AzdoContext`.

## S-1 — `remote-warning` module state (NEW)

A single boolean and one writer.

| Item | Type | Lifetime | Invariants |
|------|------|----------|------------|
| `warned` | `boolean` (module-scope, initial `false`) | Process | Becomes `true` on first call to `noticeCredentialBearingRemote()` and never returns to `false` within the same process (except via the test-only `__resetForTests()` helper). |
| `noticeCredentialBearingRemote(): void` | function | Process | If `warned === false`: write the FR-004a warning string to `process.stderr` and set `warned = true`. Otherwise: no-op. The function MUST NOT throw. |
| `__resetForTests(): void` | function (test-only) | Process | Resets `warned` to `false`. Documented as test-only with an inline comment so consumers don't call it from production code. |

**Why module-scope, not class-instance state**: the warning is truly process-local (FR-004a). A class instance would require threading the instance through every consumer; the constitution's Simplicity principle prefers the smaller approach.

**Why `__resetForTests` and not dependency injection**: injecting an emitter through every URL-parsing call site would multiply the surface for a behaviour that is overwhelmingly internal. The test reset hook is a standard pattern in this codebase (`src/services/credential-store.ts` uses the same shape — see existing tests).

## S-2 — Multi-match error format (NEW string contract)

Not state, but worth recording at planning time because the test contract pins it.

| Field | Value |
|-------|-------|
| Stream | `process.stderr` |
| Line shape | `Multiple open pull requests match branch <branch>: <#a>, <#b>[, <#c>…]. Re-run with --pr-number to choose.` |
| Trailing newline | yes (single `\n`) |
| Exit code | non-zero (`1`, matching `writeError` callers elsewhere in `pr.ts`) |
| No interactive prompt | enforced by absence of any `readline` import in the code path |

## S-3 — Zero-match error format (CLARIFIED string contract)

Already in the spec but documented here so the tests have an unambiguous fixture:

| Field | Value |
|-------|-------|
| Stream | `process.stderr` |
| Line shape | `No open pull request matches branch <branch>. Pass --pr-number to target a specific PR, or push the branch and open a pull request.` |
| Trailing newline | yes |
| Exit code | non-zero (`1`) |

## What is NOT in the model

- No persisted "credential-bearing remote known" record. The warning never reads from or writes to the user's filesystem or config.
- No expansion of `AzdoContext` to remember whether the original URL had userinfo. The information is intentionally discarded after the warning fires.
- No new TypeScript types beyond function signatures in the new `remote-warning.ts` module.
