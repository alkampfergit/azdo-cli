# Contract: update-check service

**Feature**: 022-version-update-check | **Module**: `src/services/update-check.ts`

This is a CLI-internal module contract (no HTTP contract is exposed by this tool; the only outbound call is to the public npm registry).

## Public surface

```ts
export interface UpdateCheckDeps {
  now?: () => number;                         // default: Date.now
  readCache?: () => string | null;            // default: read ~/.azdo/update-check.json
  writeCache?: (data: string) => void;        // default: write ~/.azdo/update-check.json
  fetchLatest?: () => Promise<string | null>; // default: fetch registry latest, return version or null
  isTTY?: () => boolean;                       // default: () => Boolean(process.stderr.isTTY)
  currentVersion?: string;                    // default: version from src/version.ts
}

/**
 * Best-effort update check. Resolves to a one-line notice string when a fresh,
 * successful check finds a newer stable version, otherwise null. NEVER throws,
 * NEVER blocks beyond the bounded fetch, NEVER writes to stdout/stderr itself.
 */
export function getUpdateNotice(opts?: { enabled?: boolean } & UpdateCheckDeps): Promise<string | null>;

/** Helper: numeric semver "is `latest` strictly newer than `current`?" (pre-release < release). */
export function isNewer(latest: string, current: string): boolean;
```

Dependency injection (clock, fs, fetch, TTY, version) exists purely so unit tests run with no real I/O.

## Behavioural contract

| # | Given | When | Then |
| --- | --- | --- | --- |
| C1 | `enabled === false` (`--no-update-check`) | `getUpdateNotice` called | returns `null`; no cache read, no fetch |
| C2 | `isTTY()` is false | called | returns `null`; no fetch |
| C3 | cache `lastCheck` within `THROTTLE_MS` of `now()` | called | returns `null`; **no fetch** (cached window) |
| C4 | throttle elapsed; `fetchLatest()` returns version **newer** than current | called | writes cache `{lastCheck: now, latestVersion}`; returns the one-line notice |
| C5 | throttle elapsed; `fetchLatest()` returns version **≤** current | called | writes cache; returns `null` |
| C6 | throttle elapsed; `fetchLatest()` throws / returns null (network fail or timeout) | called | **cache unchanged**; returns `null` |
| C7 | cache file missing / corrupt / wrong shape | called | treated as `lastCheck=0`; proceeds to fetch; never throws |
| C8 | current version unparseable or ≥ latest (dev/local build) | called | returns `null` (no misleading notice) |

## Caller contract (`src/index.ts`)

- Register a global `--no-update-check` option (commander `--no-x` → `opts().updateCheck` defaults `true`).
- Switch `program.parse()` → `await program.parseAsync()`.
- After the command runs (commander `postAction` hook, or after `parseAsync` resolves), call `getUpdateNotice({ enabled: program.opts().updateCheck })` and, if it returns a string, `process.stderr.write(notice + "\n")`.
- Skip the call for `-v/--version` and help paths.
- The notice must print **after** the command's own output and must not change the process exit code.

## Non-functional guarantees

- No throw escapes `getUpdateNotice`.
- At most one registry request per `THROTTLE_MS` window.
- No writes to stdout; notice text is returned, the caller writes it to stderr.
- No new runtime dependency.
