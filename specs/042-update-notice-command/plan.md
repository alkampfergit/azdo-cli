# Implementation Plan: Explicit install command in the update notice

**Branch**: `feature/042-update-notice-command` | **Spec**: [spec.md](./spec.md)

## Summary

Change one string literal in `getUpdateNotice()` and its two mirrors (the unit
test assertion and the documented sample line).

## Technical Context

TypeScript 5.x strict, vitest. No new dependencies. No I/O, throttle or
opt-out logic touched.

## Constitution Check

- Scope is minimal and matches the approved issue discussion — PASS.
- Tests updated alongside the change (red → green on the assertion) — PASS.
- Documentation (`docs/commands.md`) updated in the same PR; `README.md`
  untouched because install/quick start did not change (AGENTS.md convention)
  — PASS.

## Design

| File | Change |
|------|--------|
| `src/services/update-check.ts:193` | `npm i -g azdo-cli` → `npm install -g azdo-cli@latest` |
| `tests/unit/update-check.test.ts` (C4) | assert the full `Run \`npm install -g azdo-cli@latest\` to update.` clause; assert `npm i -g` is absent |
| `docs/commands.md` *Update notifications* | sample line updated |
| `docs/changelogs/unreleased.md` | *Changed* entry |

Word order: the owner suggested `npm install azdo-cli@latest -g`; npm accepts
either order. The flag-first form was chosen (agreed on #108) because it
matches `README.md` and npm's own documentation.
