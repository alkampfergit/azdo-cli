# Data Model: Check for new stable version on startup

**Feature**: 022-version-update-check | **Date**: 2026-06-01

This feature has a single persisted entity (a small local cache) and a couple of transient value objects. No Azure DevOps or network entity is persisted.

## Entity: UpdateCheckCache (persisted)

Stored at `~/.azdo/update-check.json`.

| Field | Type | Description | Notes |
| --- | --- | --- | --- |
| `lastCheck` | number (epoch ms) | Timestamp of the last **successful** registry check | Only updated on success; drives the 10-min throttle |
| `latestVersion` | string (semver) | Latest stable version seen at `lastCheck` | e.g. `"0.6.0"` |

**Validation / tolerance**:
- File missing, empty, non-JSON, or failing the type guard → treated as "no recent check" (proceed as if `lastCheck = 0`); never throws (FR-008).
- Type guard requires `lastCheck` to be a finite number and `latestVersion` a non-empty string; otherwise discard.

**Lifecycle**:
- Read at the start of every (non-suppressed) check.
- Rewritten only after a successful registry fetch.
- A failed fetch leaves it unchanged (clarification 1).
- Safe to delete at any time (pure cache).

## Value object: RunningVersion (transient)

- Source: `version` exported from `src/version.ts` (i.e. `package.json` version).
- Used as the left operand of the "is newer" comparison.

## Value object: UpdateNotice (transient)

Produced only when a fresh successful check finds a newer stable version.

| Field | Type | Description |
| --- | --- | --- |
| `currentVersion` | string | The running version |
| `latestVersion` | string | The newer stable version |

Rendered as a single stderr line, e.g.:

```
A new version of azdo-cli is available: 0.5.0 → 0.6.0. Run `npm i -g azdo-cli` to update.
```

## Derived constants

| Constant | Value | Meaning |
| --- | --- | --- |
| `THROTTLE_MS` | `10 * 60 * 1000` | 10-minute throttle window |
| `FETCH_TIMEOUT_MS` | `1500` | Abort timeout for the registry request |
| `REGISTRY_URL` | `https://registry.npmjs.org/azdo-cli/latest` | Latest-stable endpoint |
