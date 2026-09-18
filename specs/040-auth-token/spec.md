# Feature Specification: `azdo auth token`

**Feature Branch**: `feature/040-auth-token`
**Created**: 2026-09-16
**Status**: Draft
**Input**: GitHub issue #98 (child of #92, point 5).

## Context

`azdo auth` can start a session (`login`), describe it (`status`, `diagnose`)
and end it (`logout`). It cannot hand the session back to the operator.

In the #92 session the CLI held a perfectly good authenticated credential — it
had just created a pull request, linked a work item and added a reviewer — but
the moment the operator needed one `PATCH` the CLI does not expose, they had to
mint a **second** credential (a PAT in an environment variable) for the same
identity. The working credential existed, was already in the OS vault, and was
simply not reachable through any sanctioned route. The task stalled on
authentication, not on capability.

`gh auth token` is the precedent: the credential belongs to the user, the CLI is
merely its custodian, and printing it on request is the escape hatch that keeps
every future capability gap survivable without a generic `azdo api` command.

Nothing about the Azure DevOps REST surface changes here. The token this command
prints is the same string `azdo` already puts in an `Authorization` header on
every call — the feature is a read of state the CLI already resolves.

## User Scenarios

### US-1 — Fill a capability gap by hand (P1)

An operator hits an endpoint the CLI does not wrap. They run
`TOKEN=$(azdo auth token)` and issue the call with `curl`, using the same
identity and the same permissions every other `azdo` command uses. No second
credential is minted, nothing is stored anywhere new.

### US-2 — Scripted use (P1)

A script captures the token from stdout. stdout carries **exactly** the token
and a trailing newline — no banner, no prompt, no decoration, nothing that would
have to be stripped. The command never prompts, TTY or not.

### US-3 — An expired OAuth access token (P1)

The stored credential is OAuth and its access token has expired. The command
refreshes it first (the existing silent-refresh path) and prints the **fresh**
access token, so a caller never receives a token that is already dead.

### US-4 — Not logged in (P1)

No credential resolves for the org. The command fails with the standard
"log in to `<org>`" message on **stderr**, prints nothing on stdout, and exits
non-zero — a `$(...)` capture yields an empty string rather than an error page.

### US-5 — Knowing what kind of token you just got (P2)

Azure DevOps takes a PAT as `Authorization: Basic base64(":<pat>")` and an Entra
OAuth access token as `Authorization: Bearer <token>`, and Microsoft's own
guidance is that tokens are **opaque** — a caller must not decode one to find
out which it is. So when a human is watching (stderr is a TTY), the command
writes a one-line description of the credential — kind, source, account, expiry
and the header form to use — to **stderr**, never stdout.

### US-6 — Traceability (P2)

Every export appends an `auth.token` entry to `~/.azdo/audit.log`, recording
that an export happened and for which org — never what was exported.

## Requirements

### Functional

- **FR-001** A new command `azdo auth token` MUST print the credential the CLI
  would use for the resolved org to stdout, followed by a single `\n`, and exit
  `0`. stdout MUST carry nothing else.
- **FR-002** The command MUST resolve the credential through the **existing**
  resolution ladder, in the documented order: `AZDO_PAT` environment variable →
  stored credential for the org → `AZDO_PAT` in a `.env` file. The exported
  token is by definition the one `azdo` would have sent itself.
- **FR-003** When the resolved credential is OAuth and its access token is past
  expiry (60-second skew margin), the command MUST refresh it first and print
  the refreshed access token.
- **FR-004** The command MUST accept the group's `--org <name>` option and
  otherwise resolve the org the same way every other command does.
- **FR-005** The command MUST NOT be gated behind a flag, a prompt or a
  confirmation — it matches `gh auth token`. Rationale: the credential is
  already readable by anything running as this user, a prompt would break the
  scripted use in US-2, and the audit entry (FR-009) provides the traceability a
  gate would be reaching for. **Resolves open decision 1 of issue #98.**
- **FR-006** The command MUST NOT offer `--json`. The whole payload is one
  opaque string; a JSON envelope would only invite the token into machine-read
  logs. `azdo auth status --json` already reports the credential's metadata
  without the token, and remains the way to read kind/account/expiry
  programmatically.
- **FR-007** When stderr is a TTY, the command MUST write one descriptive line
  to **stderr**: credential kind, where it came from, account id and expiry (for
  OAuth), and the `Authorization` header form that token requires. When stderr
  is not a TTY it MUST write nothing. **Resolves open decision 2 of issue #98.**
- **FR-008** Failure modes MUST follow the `auth` group's existing exit codes:
  `3` org could not be resolved, `4` OS credential store unavailable, `1` no
  credential stored (message naming `azdo auth login --org <name>`), `1` OAuth
  refresh rejected (the existing FR-014 message; the stored credential is
  preserved). Every failure MUST write to stderr and leave stdout empty.
- **FR-009** A successful export MUST append an `auth.token` event to the audit
  log carrying `ts`, `event`, `org`, `backend` and, for OAuth, `accountId` —
  and no token material. The audit record MUST be written **before** the token
  reaches stdout.
- **FR-010** The token MUST NOT appear in the trace file. (`auth token` issues
  no traced HTTP call; the only network call it can make is the existing OAuth
  refresh, which does not go through the trace writer.)

### Non-functional

- **NFR-001** No new runtime dependencies.
- **NFR-002** No new credential-resolution path. The command MUST share the one
  `resolveCredential()` already uses, so "the token `azdo` uses" and "the token
  `azdo auth token` prints" cannot drift.
- **NFR-003** No extra network call beyond the refresh FR-003 may need.

## Out of Scope

- A generic `azdo api` passthrough command (the other half of #92's point 5 —
  a separate, larger feature).
- Printing a ready-made `Authorization` header value, a `curl` invocation, or
  writing the token to a file or environment file.
- Minting, rotating or revoking tokens (the PAT Lifecycle Management API).
- Exporting the **refresh** token. Only the access token / PAT — the credential
  needed to call the API — is exportable; the refresh token is the CLI's to keep.
- Any `--json` output for this command (FR-006).

## Success Criteria

- **SC-001** `azdo auth token --org myorg | wc -l` is `1`, and the single line
  equals the stored PAT exactly.
- **SC-002** `azdo auth token` with no credential exits non-zero and produces an
  empty stdout.
- **SC-003** After an export, the last line of `~/.azdo/audit.log` parses as JSON
  with `event: "auth.token"` and contains the token nowhere within it.
- **SC-004** An expired OAuth credential yields the post-refresh access token.
