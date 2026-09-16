# PR Report: `azdo auth token`

**Branch**: `feature/040-auth-token`
**Date**: 2026-09-16
**Spec**: [specs/040-auth-token/spec.md](./spec.md)

## Summary

`azdo auth` could start a session, describe it and end it — but never hand it
back. In #92 the CLI held a perfectly good credential and the operator still had
to mint a second one (a PAT in an environment variable) to issue a single
`PATCH` the CLI does not wrap. `azdo auth token` closes that: it prints the
credential the CLI itself would use, on stdout and nothing else.

## What's New

- **`src/commands/auth.ts` — `azdo auth token`**: resolves the org the usual
  way, exports the credential, records the export, and writes `<token>\n` as its
  single stdout write. No prompt, no gate, no `--json`.
- **`src/services/auth.ts` — `exportCredential(org)`**: the credential ladder
  (`AZDO_PAT` → stored credential, refreshed if the OAuth access token is past
  expiry → `.env`) now lives here and returns an `ExportedCredential`
  discriminated union that also carries `source`, `accountId`, `expiresAt` and
  `scope`. `resolveCredential()` — what `azdo-client` / `pr-client` call — became
  a two-line projection of it.
- **`src/types/audit.ts`**: new `auth.token` audit event kind.

## Design Notes

- **One ladder, two views.** The obvious implementation reads the vault
  directly, and is the one implementation that can hand out a token the CLI
  would not have used (a stale OAuth access token, or the vault entry while
  `AZDO_PAT` is set). Making `resolveCredential()` a projection of
  `exportCredential()` means the token `azdo` sends and the token it prints come
  from the same code path by construction, not by discipline.
- **Ungated — resolves open decision 1 of #98.** No flag, no confirmation,
  matching `gh auth token` and Microsoft's own
  `az account get-access-token --resource 499b84ac-…`, which the Azure Repos
  docs recommend for exactly this job. The credential is already readable by
  anything running as this user, and a prompt would break the scripted use that
  motivated the issue. Traceability comes from the audit entry instead.
- **Credential description on stderr, TTY-gated — resolves open decision 2.**
  Azure DevOps takes a PAT as `Authorization: Basic base64(":<pat>")` and an
  Entra access token as `Authorization: Bearer <token>`, while
  [documenting tokens as opaque](https://learn.microsoft.com/azure/devops/integrate/get-started/authentication/authentication-guidance?view=azure-devops#frequently-asked-questions-faq)
  ("don't decode or inspect them"). A bare token is therefore not enough to
  build a request from. The kind, source, account, expiry and header form go to
  stderr when stderr is a TTY, and nowhere at all when it is not — so a script
  sees a byte-for-byte silent stderr.
- **No `--json`.** The issue forbids the token in `--json` output, which would
  leave an empty envelope. `azdo auth status --json` is already the
  machine-readable view of this credential and omits token material by design.
- **The audit record is written before the stdout write**, so an export is
  recorded even if the consumer dies mid-pipe. It carries `org`, `backend` and
  (OAuth only) `accountId` — `appendAuthAuditEvent` is never handed token
  material, and strips `token`/`accessToken`/`refreshToken`/`pat` regardless.
- **stdout stays empty on every failure path** (exit 1 missing credential or
  rejected refresh, 3 org unresolved, 4 vault unavailable), so
  `TOKEN=$(azdo auth token)` yields an empty string rather than an error page.

## Out of Scope

A generic `azdo api` passthrough (the other half of #92 point 5), exporting the
**refresh** token, and minting/rotating/revoking credentials.

## Verification

- `npm test` — 1201 passed, 128 skipped, 0 failed.
- `npm run lint` — 0 errors (2 pre-existing warnings in `audit-log.test.ts`,
  untouched by this branch).
- New: `tests/unit/auth-token.test.ts` (13 cases — byte-exact stdout, TTY and
  non-TTY stderr, OAuth refresh, `AZDO_PAT` precedence, all four exit codes with
  empty stdout, the audit record's contents, `--json` rejected) and six
  `exportCredential()` cases in `tests/unit/auth.test.ts`.

## Docs

`docs/authentication.md` gains an "Exporting the token" section (both header
forms with `curl` examples, the TTY rule, the exit-code table, the
password-equivalence warning) and an `auth.token` row in the audit-log table;
`docs/commands.md` gains the command row. `README.md` is unchanged — installation,
quick start, the command-group table and the dev setup are all untouched, and
per the repository's documentation convention subcommand detail belongs in
`docs/`.
