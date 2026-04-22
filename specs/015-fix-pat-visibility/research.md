# Research: Fix PAT Input Visibility Bug

## Root Cause Analysis

**Decision**: The bug is caused by `createInterface` in `src/services/auth.ts:29` being initialized with `output: process.stderr`.

**Rationale**:
- Node.js `readline.createInterface` with a non-null `output` stream echoes received input characters to that stream automatically.
- Even in raw mode, readline's internal echo mechanism fires before our `onData` handler processes each character.
- During a paste, all characters arrive in a single burst. Readline echoes them all immediately as raw text to stderr, producing a visible line of the actual PAT. Our `redraw()` call then writes the masked version to stderr on the same line (via `\r`), but because readline may have inserted newlines or the paste produced partial line breaks, the masked version ends up on a *new* line beneath the raw one.

**Alternatives Considered**:
1. `output: null` (chosen) — disable readline echoing entirely; all output is managed by `process.stderr.write` in `onData`. Minimal, correct.
2. Remove `createInterface` entirely — also viable since `rl` is only used for `rl.close()`. However, `rl.close()` properly cleans up the readline interface and prevents the `process.stdin` from staying in a paused state. Keeping it with `output: null` is safer.
3. `process.stdin.pause()` before creating `rl` — could cause missed characters; more complex.

## Autonomous Decisions

- [AUTO] Chose `output: null` over removing `createInterface` because `rl.close()` provides clean teardown of the readline interface, preventing edge-case hangs on stdin. The change is a single argument modification.
