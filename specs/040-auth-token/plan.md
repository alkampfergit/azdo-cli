# Implementation Plan: `azdo auth token`

**Branch**: `feature/040-auth-token` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)
**Input**: `specs/040-auth-token/spec.md`, GitHub issue #98

## Summary

One new subcommand on an existing group, over a resolution ladder that already
exists. The only structural change is that `services/auth.ts` grows a
metadata-carrying `exportCredential()` and `resolveCredential()` is rewritten as
a two-line projection of it — so the token the CLI **sends** and the token it
**prints** come from one code path and cannot drift (NFR-002).

## Technical Context

**Language/Version**: TypeScript 5.x (`strict: true`) on Node.js LTS (18+)
**Primary Dependencies**: commander.js — **no new dependencies**
**Storage**: existing OS credential store + `~/.azdo/audit.log`
**Testing**: vitest (`tests/unit/auth-token.test.ts`)
**Target Platform**: Node CLI (Windows / macOS / Linux)
**Performance**: zero network calls, except the OAuth refresh FR-003 may require

## Constitution Check

| Principle | Compliance |
| --- | --- |
| I. CLI-First | A commander subcommand; token → stdout, description and errors → stderr; exit codes reuse the `auth` group's contract (0 / 1 / 3 / 4). `--json` is deliberately **not** applicable — see FR-006 and D-3; the machine-readable view of this credential is `azdo auth status --json`, which exists and omits the token by design. |
| II. TypeScript Strictness | `ExportedCredential` is a discriminated union on `kind`, so the OAuth-only fields (`accountId`, `expiresAt`, `scope`) are reachable without a non-null assertion. No `any`. |
| III. Single Responsibility | The command prints a token. It does not mint, rotate, validate or wrap one; `azdo api` stays out of scope. |
| IV. npm Distribution | No new dependency, no build change. |
| V. Simplicity | No new resolution path, no new flag, no prompt machinery. The one addition beyond "print the token" is a TTY-gated stderr line, justified by R-2. |
| VI. ADO API Research | [research.md](./research.md) — Microsoft Learn MCP; no ADO REST surface is touched. |

No violations; no complexity-tracking entries.

## Design

### Service — `src/services/auth.ts`

```ts
export type CredentialSource = 'env' | 'credential-store' | 'dotenv';

export type ExportedCredential =
  | { kind: 'pat'; token: string; source: CredentialSource }
  | {
      kind: 'oauth';
      token: string;
      source: 'credential-store';
      accountId: string;
      expiresAt: number;
      scope: string;
    };

export async function exportCredential(org: string): Promise<ExportedCredential>;
```

`exportCredential()` *is* the ladder that `resolveCredential()` used to contain:
`AZDO_PAT` → stored credential (refreshing OAuth past expiry) → `.env`, throwing
`CredentialMissingError` when nothing resolves and propagating
`CredentialRefreshError` / `CredentialStoreUnavailableError` unchanged.
`resolveCredential()` becomes:

```ts
const cred = await exportCredential(org);
return cred.kind === 'pat'
  ? { kind: 'pat', token: cred.token }
  : { kind: 'oauth', bearerToken: cred.token, accountId: cred.accountId };
```

Same ladder, same errors, same call sequence — every existing caller
(`azdo-client`, `pr-client`) is behaviourally untouched. The union's `source`
and `expiresAt` are the two facts the old signature dropped and the new command
needs.

`resolveAuthCredential()` — the resolver the write-side commands actually reach
through `requireAuthCredential()` — is a projection of `exportCredential()`
too, so the feature leaves **one** ladder rather than two that can drift (the
first review round; the original plan left it alone, which would have kept a
second copy of the precedence rules alive). Two deliberate seams keep its
callers behaviourally identical: it returns `null` instead of throwing when
nothing resolves (`CredentialMissingError` is caught; a rejected refresh still
propagates), and a `.env` PAT folds back to `source: 'env'`, because
`AuthCredential` has no `dotenv` source and `describeResolvedCredential`'s
strings are keyed off it.

### Audit — `src/types/audit.ts`

`AuthAuditEventKind` gains `'auth.token'`. Nothing else changes:
`appendAuthAuditEvent` already refuses to serialise `token` / `accessToken` /
`refreshToken` / `pat` fields, and the command passes none of them — the record
is `{ ts, event, org, backend }` plus `accountId` for OAuth (FR-009).

### Command — `src/commands/auth.ts`

`azdo auth token`, registered next to `status` / `logout` / `diagnose`, reading
`--org` through `optsWithGlobals()` like its siblings:

1. `resolveOrg({ org })` → exit `3` on failure (unchanged group behaviour).
2. `exportCredential(org)`; map `CredentialStoreUnavailableError` → `4`,
   `CredentialMissingError` → `1`, `CredentialRefreshError` → `1` (FR-008).
   Nothing is written to stdout on any of these paths.
3. `appendAuthAuditEvent({ event: 'auth.token', … })` — before the print, so an
   export is recorded even if the consumer dies mid-pipe (FR-009).
4. `if (process.stderr.isTTY)` → one description line on stderr (FR-007).
5. `process.stdout.write(`${token}\n`)` — the only stdout write (FR-001).

The description line names the header form from research R-1, e.g.

```
PAT for org myorg from the OS credential store (linux-libsecret).
Send it as: Authorization: Basic base64(":<token>")  (curl: -u :<token>)
```

```
OAuth access token for org myorg from the OS credential store (macos-keychain);
account user@contoso.com, expires 2026-09-16T15:04:05.000Z.
Send it as: Authorization: Bearer <token>
```

## Testing Strategy

`tests/unit/auth-token.test.ts`, driven through `createAuthCommand()` with the
credential store, `oauth-token-refresh`, `org-resolver` and `audit-log` mocked
(the pattern `auth-command.test.ts` already uses):

- stdout is byte-exactly `<token>\n` for a stored PAT, exit 0
- stderr silent when not a TTY; the description line appears when it is
- expired OAuth → `refreshIfNeeded` called, refreshed access token printed
- `AZDO_PAT` wins over the vault
- not logged in / unresolved org / vault unavailable / refresh rejected →
  correct exit code, message on stderr, **empty stdout**
- the audit record carries `event: 'auth.token'` and, serialised, does not
  contain the token
- `--json` is rejected (no such option) and prints no token

## Documentation

- `docs/authentication.md`: an "Exporting the token" subsection under
  *Inspecting* (what it prints, the two header forms, the TTY-gated stderr line,
  the exit codes, and the "treat it as a password" warning) plus an `auth.token`
  row in the audit-log table.
- `docs/commands.md`: one row in the auth command table.
- `README.md`: the auth bullet gains one clause naming `azdo auth token`
  (Constitution §Development Workflow: README must reflect the implemented
  commands). Detail stays in `docs/authentication.md` per the repository's
  documentation convention.
- `CLAUDE.md` / `AGENTS.md`: Recent Changes entry.
