# Research: Better support for commenting in the pull request (023)

**Feature**: 023-pr-comments-status · **Issue**: #50 · **Date**: 2026-06-03

This document resolves the technical unknowns behind the three concerns in
the spec, grounded in the current implementation.

---

## R1 — Why `azdo pr status` reports "no checks" when green checks exist (US1, the defect)

**Finding.** `pr status` builds its checks list from a single source:
`getPullRequestChecks()` (`src/services/pr-client.ts:233`) calls the Azure
DevOps **Pull Request Status API**:

```
GET .../git/repositories/{repo}/pullRequests/{prId}/statuses?api-version=7.1
```

That endpoint returns only *statuses posted via the Status API* (third-party
/ manual / external integrations). It does **not** return **branch policy
evaluations** — and branch policies (Build Validation, Required Reviewers,
Comment Resolution, Status checks required by policy, etc.) are exactly the
"green checks" a user sees in the Azure DevOps PR UI. For the common case
(a build-validation policy passing green) the `/statuses` collection is
empty, so `formatPullRequestChecks()` (`src/commands/pr.ts:136`) prints
`Checks: none reported by Azure DevOps` even though checks are clearly
running. This is the reported bug.

**Decision.** Surface **policy evaluations** in addition to statuses. Fetch:

```
GET .../{project}/_apis/policy/evaluations
    ?artifactId=vstfs:///CodeReview/CodeReviewId/{projectId}/{prId}
    &api-version=7.1
```

Map each evaluation's configuration type + status to the existing
`PullRequestCheck` shape (name + state), merge with the Status-API results,
and display the union. Reserve the "none reported" message for the case
where **both** sources are genuinely empty.

**Project GUID needed.** The policy `artifactId` requires the project
**GUID**, but the raw PR object (`AzdoPullRequest`) and `AzdoContext` only
carry the project **name**. Resolve the GUID once via the Projects API:

```
GET .../_apis/projects/{projectNameOrId}?api-version=7.1   → .id (GUID)
```

Cache it for the duration of the command (one lookup, not per-PR).

**Error vs. empty distinction (FR-002).** If a checks/policy fetch *fails*
(HTTP error, auth), the command must not silently say "none". Surface a
distinct message (e.g. `Checks: unable to retrieve (…)`) so "genuinely
none" is never confused with "couldn't retrieve". The existing
`fetchWithErrors` / `HTTP_` error path is reused; only the empty-vs-error
branching in the status command/formatter changes.

**Alternatives considered.**
- *Only fix the message wording* — rejected: the data is genuinely missing,
  not just mislabelled. Users want to see the policy checks.
- *Use the `pullRequests/{id}?includeCommits=false&...` expansion* —
  rejected: PR expansion does not include policy evaluation states; the
  dedicated policy/evaluations endpoint is the supported source.

---

## R2 — Definition of a "code comment" / "code-related" thread (US2, US3)

**Finding.** A thread already exposes its file anchor: `mapThread()`
(`src/services/pr-client.ts:112`) sets
`threadContext: thread.threadContext?.filePath ?? null` on
`ActiveCommentThread`. The formatter already prints `(general)` when
`threadContext` is null (`src/commands/pr.ts:173`).

**Decision.** "Code-related" / "code comment" = a thread whose
`threadContext` (file path) is **non-null**. `--code-related-only` keeps
threads with `threadContext !== null`; general threads (null) are dropped.
The US3 counts use the same predicate. No new data is needed from the API —
the field is already mapped.

**Edge case (deleted file).** A thread anchored to a since-deleted file
still carries a `threadContext.filePath`, so it remains "code-related" — the
spec's stated default. No special handling required.

---

## R3 — Resolved vs. open thread-state mapping (US2 `--exclude-resolved`, US3 counts)

**Finding.** The mapping already exists: `isThreadResolved()`
(`src/services/pr-client.ts:153`) with
`RESOLVED_THREAD_STATUSES = {fixed, wontFix, closed, byDesign}`. Everything
else (`active`, `pending`, …) is treated as open. This already backs the
existing `--hide-resolved` filter and the comment-resolve idempotency check.

**Decision.** Reuse `isThreadResolved()` verbatim for both
`--exclude-resolved` and the open/closed code-comment counts. "Closed code
comments" = code-anchored threads where `isThreadResolved(status)` is true;
"open code comments" = code-anchored threads where it is false. This keeps
one single source of truth for the open/closed classification (FR-009).

---

## R4 — `--exclude-resolved` already exists as `--hide-resolved`

**Finding.** `pr comments` **already** has a `--hide-resolved` flag
(`src/commands/pr.ts:339`) with identical semantics to the requested
`--exclude-resolved`. The issue author asked for `--exclude-resolved`,
likely unaware of the existing flag (added in 017-pr-comments-threads).

**Decision.** Add `--exclude-resolved` as an **alias** of the existing
`--hide-resolved` rather than a second, divergent code path. commander.js
supports multiple option names; map both to the same `hideResolved` boolean
(or OR them). This satisfies FR-004/FR-006 with zero regression and avoids
two flags that mean the same thing. Document `--exclude-resolved` as the
primary name and `--hide-resolved` as a retained alias.

**Alternatives considered.**
- *Rename `--hide-resolved` → `--exclude-resolved`* — rejected: breaking
  change for anyone already scripting `--hide-resolved` (violates FR-006 /
  no-regression).
- *Two independent flags* — rejected: redundant, confusing, and could
  diverge.

---

## R5 — `--code-related-only` is a new, independent filter

**Finding.** No existing flag filters by anchor. The filter is applied at the
command layer over `getPullRequestThreads()` results (same place the
`--hide-resolved` filter already lives, `src/commands/pr.ts:392`).

**Decision.** Add `--code-related-only` as a new boolean option on
`pr comments`. Apply it as a thread-list filter
(`thread.threadContext !== null`) composable with the resolved filter; both
default off so the no-flag output is unchanged (FR-005, FR-006). Reflect the
filtered set in JSON output too (FR-010) — the existing `--json` branch
serialises the same filtered `threads` array.

---

## R6 — Comment counts in `pr status` (US3)

**Finding.** `pr status` currently fetches checks per PR but does **not**
fetch threads. To show open/closed code-comment counts it must also fetch
threads for each listed PR (reusing `getPullRequestThreads()`), then count
code-anchored threads bucketed by `isThreadResolved`.

**Decision.** For each PR in `pr status`, fetch threads, compute
`openCodeComments` and `closedCodeComments` (code-anchored only), and render
a one-line summary in the human output plus fields in the JSON result. The
fetch mirrors the existing per-PR `getPullRequestChecks` `Promise.all` map
in the status command (`src/commands/pr.ts:224`).

**Performance note.** This adds one threads request per PR listed by
`pr status` (typically 0–1 PRs for the current branch). Negligible; no
batching needed (Constitution V — simplicity).

---

## Summary of decisions

| # | Decision |
|---|----------|
| R1 | Fetch **policy evaluations** + statuses; resolve project GUID via Projects API; distinguish empty vs. error. |
| R2 | "Code comment" = thread with non-null `threadContext.filePath` (already mapped). |
| R3 | Reuse `isThreadResolved()` for `--exclude-resolved` and the open/closed counts. |
| R4 | `--exclude-resolved` = **alias** of existing `--hide-resolved` (no rename, no regression). |
| R5 | Add new `--code-related-only` filter; composable; default off; reflected in JSON. |
| R6 | `pr status` also fetches threads to compute open/closed code-comment counts. |

No `NEEDS CLARIFICATION` items remain.
