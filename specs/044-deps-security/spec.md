# Spec: 044-deps-security — close the Dependabot alerts, in-range dependency bumps

**Issue**: #112 · **Scope agreed on the issue**: step 1 of 2 (majors ship separately).

## Problem
Dependabot reports 3 moderate alerts, all in dev-only packages
(`npm audit --omit=dev` reports 0 — the published package is not affected):

| Alert | Package | Via | Fixed in |
|-------|---------|-----|----------|
| 26 / 25 | `vitest` / `@vitest/mocker` — path traversal via redirect mock (GHSA-82fw-gwwq-j7x9) | direct dev dep | 4.1.11 |
| 24 | `@humanfs/node` — recursive copy follows symlinks (GHSA-p498-v437-472g) | transitive via `eslint` | 0.16.8 |

## Requirements
- **FR-001** `npm audit` reports 0 vulnerabilities.
- **FR-002** Every direct dependency is at the latest version inside its current
  major: vitest 4.1.11, eslint 10.11, typescript-eslint 8.70, prettier 3.9,
  @types/node 25.9, @napi-rs/keyring 1.3.
- **FR-003** No source, command, output or exit-code change; `npm test && npm run lint` pass.

## Out of scope
Major bumps (commander 15, @napi-rs/keyring 2, vitest 5, TypeScript 7,
@types/node 26) — step 2, one commit per major, in a separate PR.
