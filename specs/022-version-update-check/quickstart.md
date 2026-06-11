# Quickstart: Check for new stable version on startup

**Feature**: 022-version-update-check | **Date**: 2026-06-01

## What it does

When you run any `azdo` command, the CLI occasionally checks npm for a newer **stable** release and, if one exists, prints a single line after the command output:

```
A new version of azdo-cli is available: 0.5.0 → 0.6.0. Run `npm i -g azdo-cli` to update.
```

The check runs at most **once every 10 minutes**, never blocks your command, and stays silent when it can't reach npm.

## Try it

```bash
# Normal run — may show a one-line notice after output (at most once per 10 min)
azdo get-item 123

# Within 10 minutes, subsequent runs do NOT re-check or re-notify
azdo get-item 124            # no notice (cached window)

# Opt out for a single invocation
azdo --no-update-check get-item 123

# Scripted / piped (non-interactive) — notice is suppressed automatically
azdo get-item 123 | cat      # no notice on stderr-less/non-TTY contexts
```

## Cache

State lives at `~/.azdo/update-check.json`:

```json
{ "lastCheck": 1750000000000, "latestVersion": "0.6.0" }
```

Delete it any time to force a fresh check on the next run.

## Verifying the behaviour (manual)

1. **Notice appears**: temporarily set the running version below the published one (or delete the cache and ensure a newer version is published); run a command → one-line notice on stderr after output.
2. **Throttle**: run twice within 10 minutes → only the first triggers a registry request; the second is silent.
3. **Failure-safe**: disconnect the network, delete the cache, run a command → command works normally, no error, no notice, and `lastCheck` is NOT advanced (next run retries).
4. **Opt-out**: `azdo --no-update-check ...` → no request, no notice.
5. **Non-interactive**: pipe output or run in CI → no notice.

## Tests

```bash
npm run test:unit      # unit tests for throttle, version compare, suppression, failure-safety
npm test               # full build + unit + integration
npm run lint
```
