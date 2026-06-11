# Research: Check for new stable version on startup

**Feature**: 022-version-update-check | **Date**: 2026-06-01

All decisions below resolve to existing project conventions and built-ins; no `NEEDS CLARIFICATION` remain (the four spec clarifications were answered by the owner on 2026-06-01).

## R1: How to query npm for the latest stable version

**Decision**: `GET https://registry.npmjs.org/azdo-cli/latest` via native `fetch`, read `.version`.

**Rationale**:
- The `latest` dist-tag is npm's definition of the current **stable** release; pre-releases are published under other tags and are excluded automatically (satisfies FR-006 without client-side pre-release filtering).
- The `/<pkg>/latest` endpoint returns only the latest version's manifest (small payload) — faster and lighter than fetching the full packument `/<pkg>`.
- Native `fetch` (Node 18+) means **no new dependency** (Constitution IV).

**Alternatives rejected**:
- `npm view azdo-cli version` via child process — spawns a process, far slower, depends on npm being on PATH.
- Full packument `https://registry.npmjs.org/azdo-cli` — larger response, then we'd parse `dist-tags.latest` ourselves; unnecessary.
- Third-party libs (`update-notifier`, `latest-version`) — pull in dependency trees; violates the minimal-deps principle.

## R2: Timeout / non-blocking strategy

**Decision**: Gate on the throttle **before** any network call; when a check is due, run `fetch` with an `AbortController` timeout (~1500 ms). Emit the notice from a commander `postAction` hook (requires `await program.parseAsync()`), so it prints after the command's own output.

**Rationale**:
- The common path (within the 10-min window) performs **zero** network I/O and a single small synchronous file read — effectively free, satisfying "quickest possible" and "must not block" (FR-004, SC-003).
- A bounded timeout caps the rare fresh-check latency; a stalled registry can never hang the CLI.
- `postAction` runs after the action handler, so the notice never interleaves with or delays command output.

**Alternatives rejected**:
- Fire-and-forget unawaited promise — lost when a command calls `process.exit()`, and an in-flight socket can delay process teardown unpredictably.
- `preAction` hook — would delay the command itself.
- Detached background/daemon process — massively over-engineered for a CLI.

## R3: Cache location & format

**Decision**: `~/.azdo/update-check.json`, an object `{ "lastCheck": <epoch ms>, "latestVersion": "<x.y.z>" }`.

**Rationale**:
- `config-store.ts` already establishes `~/.azdo/` (`path.join(os.homedir(), '.azdo', 'config.json')`) as the CLI's state dir — reuse it for discoverability and a single place for users to clear state.
- Survives across invocations (the throttle requirement); a JSON object is trivial to read/validate/rewrite.

**Alternatives rejected**:
- `os.tmpdir()` — the issue says "temp file", but tmpdir can be cleared mid-window (weakening the throttle) and scatters CLI state. `~/.azdo/` is the established convention; functionally it is still a disposable cache. (Open to switching to tmpdir if the owner prefers strict "temp" semantics — noted for plan review.)
- OS keychain (`@napi-rs/keyring`) — that's for secrets, not a public version string.

## R4: Throttle & failure semantics (clarification 1)

**Decision**: Only a **successful** check writes `lastCheck`. A failed/timed-out check leaves the cache untouched, so the next invocation is free to retry.

**Rationale**: Directly encodes the owner's answer ("failed check should not reset the 10-min throttle"). Each attempt is itself bounded and non-blocking, so retry-on-next-command has no perceptible cost.

## R5: Notice cadence (clarification 3)

**Decision**: Print the single-line notice **only** on the invocation that performs a fresh successful check and finds `latestVersion > runningVersion`. No notice on cached-window invocations.

**Rationale**: Ties "shown once per 10-minute window" to the act of checking — no extra "noticeShown" flag needed, and the next check after the window re-notifies ("After 10 minutes window the check will be notified again").

## R6: Suppression (clarifications 2 & 4)

**Decision**: Skip the entire feature when (a) `--no-update-check` is present, or (b) `!process.stderr.isTTY` (non-interactive). Also skip for `-v/--version` and the help output.

**Rationale**: `--no-update-check` is the owner-chosen opt-out (FR-009). Non-TTY suppression keeps scripted/CI output clean (FR-011). Version/help are meta commands where an upgrade nag is noise.

## R7: Version comparison (no new dependency)

**Decision**: A small internal `isNewer(latest, current)` that compares dotted numeric components (major, minor, patch), treating any pre-release suffix as lower precedence; returns false on unpar;seable input.

**Rationale**: The `latest` dist-tag is already stable semver, and the running version comes from `package.json` — a minimal numeric compare suffices without adding `semver` (Constitution IV). Unparseable/dev versions (e.g. `0.0.0`) simply yield no notice (FR-010).

## R8: Error containment

**Decision**: Wrap cache read, fetch, parse, compare, and cache write so any thrown error is caught and ignored; the function resolves to "no notice" and never rejects into the command path.

**Rationale**: FR-007 (no errors surfaced) and FR-008 (corrupt/missing cache tolerated). The check is strictly best-effort.
