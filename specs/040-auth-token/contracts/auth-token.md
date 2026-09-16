# Contract: `azdo auth token`

## C-1 — Invocation

```
azdo auth token [--org <name>]
```

No other option. Notably **no** `--json` (FR-006) and **no** confirmation flag
(FR-005). `--org` is resolved by the group's standard ladder: flag → git remote
→ `azdo config set org`.

## C-2 — stdout

On success, and only on success:

```
<token>\n
```

Exactly one write, exactly one trailing newline, no prefix, no suffix, no
banner. On every failure path stdout is **empty**.

`<token>` is the string the CLI would itself put in the `Authorization` header
for that org: the `AZDO_PAT` value, the stored PAT, the stored (refreshed if
expired) OAuth access token, or the `.env` `AZDO_PAT` value — in that
precedence order.

## C-3 — stderr (description line, TTY only)

Written **only** when `process.stderr.isTTY`. Never on a pipe, never in CI.

PAT:

```
PAT for org {org} from {source}.
Send it as: Authorization: Basic base64(":<token>")  (curl: -u :<token>)
```

OAuth:

```
OAuth access token for org {org} from {source}; account {accountId}, expires {ISO-8601}.
Send it as: Authorization: Bearer <token>
```

`{source}` is one of:

| `source` | Text |
| --- | --- |
| `env` | `the AZDO_PAT environment variable` |
| `credential-store` | `the OS credential store ({backend})` |
| `dotenv` | `the AZDO_PAT entry in a .env file` |

## C-4 — Exit codes

| Code | Condition | stderr |
| --- | --- | --- |
| 0 | token printed | the C-3 line, when stderr is a TTY |
| 1 | no credential resolves for the org | `No stored credential for org "{org}". Run \`azdo auth login --org {org}\` to authenticate.` (`CredentialMissingError`, verbatim) |
| 1 | OAuth refresh rejected | `CredentialRefreshError.userMessage`, verbatim (the stored credential is preserved) |
| 3 | org could not be resolved | `formatResolutionError()`, verbatim |
| 4 | OS credential store unavailable | `CredentialStoreUnavailableError.message`, verbatim |

## C-5 — Audit record

One line appended to `~/.azdo/audit.log` before the stdout write:

```json
{"ts":"2026-09-16T13:47:10.000Z","event":"auth.token","org":"myorg","backend":"linux-libsecret"}
```

plus `"accountId"` when the exported credential is OAuth. No other field. The
token appears nowhere in the record — `appendAuthAuditEvent` is never handed
one, and strips `token` / `accessToken` / `refreshToken` / `pat` regardless.

## C-6 — What the command never does

- Never prompts, TTY or not.
- Never writes the token to stdout more than once, to stderr at all, to the
  trace file, or to any file.
- Never exports the **refresh** token.
- Never mints, validates or revokes a credential — a network call happens only
  when an expired OAuth access token has to be refreshed, which is the existing
  shared path.
