# Tasks: 040-auth-token

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [contracts/auth-token.md](./contracts/auth-token.md)
**Gate**: `npm test && npm run lint` must pass before the PR is marked ready.

`[P]` = can run in parallel with the other `[P]` tasks in the same phase.

## Phase 1 — resolution (US-1, US-2, US-3)

- [X] **T001** `src/services/auth.ts`: add `CredentialSource` and the
  `ExportedCredential` discriminated union, and `exportCredential(org)` carrying
  the ladder that `resolveCredential()` used to hold (C-2 precedence, FR-002).
- [X] **T002** `src/services/auth.ts`: rewrite `resolveCredential()` as a
  projection of `exportCredential()` — same errors, same order, no second ladder
  (NFR-002).

## Phase 2 — audit (US-6)

- [X] **T003** `src/types/audit.ts`: add `'auth.token'` to `AuthAuditEventKind`
  (C-5). No new audit fields — the record is metadata only.

## Phase 3 — the command (US-1 … US-5)

- [X] **T004** `src/commands/auth.ts`: `describeExportedCredential()` — the C-3
  description line, including the `Basic` / `Bearer` header form from research
  R-1.
- [X] **T005** `src/commands/auth.ts`: `handleToken()` — resolve org (exit 3),
  `exportCredential` with the C-4 error mapping (1 / 1 / 4), audit before print,
  TTY-gated stderr line, single stdout write.
- [X] **T006** `src/commands/auth.ts`: register `azdo auth token` with help text
  stating that stdout carries only the token, that there is no `--json`, and
  that the token is password-equivalent.

## Phase 4 — tests

- [X] **T007 [P]** `tests/unit/auth-token.test.ts` (new): byte-exact stdout,
  TTY/non-TTY stderr, OAuth refresh, `AZDO_PAT` precedence, every C-4 exit code
  with empty stdout, the C-5 audit record (and that it does not contain the
  token), and `--json` rejected.
- [X] **T008 [P]** `tests/unit/auth.test.ts`: `exportCredential()` ladder
  directly — precedence, refresh-on-expiry, `CredentialMissingError`.

## Phase 5 — docs

- [X] **T009** `docs/authentication.md`: "Exporting the token" subsection +
  `auth.token` row in the audit-log table.
- [X] **T010** `docs/commands.md`: `azdo auth token` row in the auth table.
- [X] **T011** `CLAUDE.md` + `AGENTS.md` Recent Changes, and the `README.md`
  auth bullet names `azdo auth token` (plan §Documentation).

## Phase 6 — gate

- [X] **T012** `npm test && npm run lint` green.
