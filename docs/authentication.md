# Authentication

## Overview

`azdo-cli` authenticates against Azure DevOps using either **OAuth** (Microsoft Entra v2.0 + PKCE) or a **Personal Access Token (PAT)**. Credentials are stored per Azure DevOps organisation in the OS-native secret vault and picked up automatically by every `azdo` command.

OAuth is the default since `0.6.0`. PAT remains a first-class option for users on locked-down hosts, scripted automation, or anyone who prefers it. The two coexist — different orgs can use different credential kinds simultaneously.

## Quickstart

```bash
# Default (OAuth, browser-based) — opens a browser tab to consent.
azdo auth login --org myorg

# Headless host (no browser available) — prints a code + URL pair to enter on a separate device.
azdo auth login --org myorg --device-code

# Legacy PAT path (existing users):
azdo auth login --org myorg --use-pat
# or, equivalently, the historical entry point still works:
azdo auth --org myorg
```

> **First-time OAuth setup:** the released binary ships a default `client_id` for the project's shared OAuth application. Until that GUID is registered (see [`oauth-app-registration.md`](oauth-app-registration.md) §1), OAuth flows targeting the default app will fail at the IdP. Use `--client-id <your-client-id>` (or set `AZDO_OAUTH_CLIENT_ID`) to point the CLI at your own registered app — see §2 of the same guide.

## Credential resolution order

Every authenticated command resolves a credential at runtime in this order (FR-007a):

1. **`AZDO_PAT` environment variable** — when set and non-empty, used as a PAT, no vault lookup.
2. **Stored credential for the resolved org**, read from the OS keyring slot `azdo-cli` / `pat:<org>`. The stored value is a JSON envelope with an explicit `kind`:
   - `{ kind: 'oauth', accessToken, refreshToken, expiresAt, accountId, scope, tenantId, issuedAt }` — for OAuth, the CLI silently refreshes when past expiry (60-second clock-skew margin).
   - `{ kind: 'pat', token }` — used as-is.
   - **Legacy bare-PAT entries** (pre-feature) are still tolerated as `kind: 'pat'`; they are NOT auto-rewritten on read.
3. **`AZDO_PAT` entry in a `.env` file** walking up from the current directory.

If no credential is found, commands exit with a clear error suggesting `azdo auth login --org <name>`. No silent mid-command prompt.

### OAuth silent refresh

OAuth credentials carry an `accessToken` plus a `refreshToken`. When an authenticated command runs against an expired access token:

- The CLI exchanges the refresh token at the Entra v2 token endpoint and writes the resulting fresh credential back to the vault.
- Concurrent CLI processes coordinate via a per-org file lock at `~/.azdo/.locks/<org>.refresh` plus a per-process single-flight ledger — at most one network refresh is performed across all in-flight callers.
- **Refresh failure** (refresh token revoked, refresh window exceeded, organisation access removed, app disabled on the tenant) surfaces a clear error: *"Refresh token rejected for org `<O>`; run `azdo login --org <O>` to re-authorise"* and **leaves the existing stored credential in place** (FR-014). The user runs the explicit re-login and the audit log records the failure.

## Organisation resolution order

Every command (including `azdo auth login`) resolves the target Azure DevOps organisation using:

1. `--org <name>` flag (highest).
2. Auto-detect from the current working context (git remote `origin`, when it points at `dev.azure.com/<org>` or `<org>.visualstudio.com`). Run `azdo auth login` from inside an AzDO-backed repo and you don't need `--org`.
3. Persistent default from `azdo config set org <name>` (`~/.azdo/config.json`).
4. Error with a single-line diagnostic naming each step.

The working-context git remote wins over a persistent config default so `cd`-ing into a different org's repo "just works".

## Logging in

```bash
# OAuth, browser flow (default).
azdo auth login --org myorg

# OAuth, device-code flow (headless: CI runners, dev containers, remote SSH).
azdo auth login --org myorg --device-code

# OAuth with a self-registered app on a locked-down tenant.
azdo auth login --org myorg --client-id <your-client-id> --tenant-id <your-tenant-id>

# PAT — interactive prompt (masked), validates, stores.
azdo auth login --org myorg --use-pat

# PAT — non-interactive (for provisioning / CI).
echo "<pat>" | azdo auth login --org myorg --use-pat --from-stdin

# PAT — skip the browser assist that normally opens the AzDO PAT page.
azdo auth login --org myorg --use-pat --no-browser
```

Mutual exclusion (each exits with code `2`): `--use-pat` + `--device-code`, `--use-pat` + any of `--client-id` / `--tenant-id` / `--scopes`.

PATs are validated against `GET https://dev.azure.com/<org>/_apis/projects?$top=1` before being stored — an invalid PAT is never written to the vault. OAuth credentials are validated by the round-trip with Entra; the CLI accepts any token Entra issued.

### Inspecting

```bash
# Aggregate status across all stored orgs (table to stdout, never the token).
azdo auth status

# Per-org detail.
azdo auth status --org myorg
azdo auth status --org myorg --json
```

Status reports the credential `kind` (`pat` or `oauth`), the account id (OAuth only — Entra `oid` or `preferred_username`), the expiry timestamp (OAuth), the granted scope set (OAuth), and the keyring backend. **It never prints token material.**

### Removing

```bash
# Single org.
azdo auth logout --org myorg

# Every stored credential (PAT and OAuth alike).
azdo auth logout --all
```

The legacy `azdo clear-pat` command still works but is deprecated — it prints a one-line deprecation notice and calls the same service.

## Multi-org

Each org has its own stored credential. `azdo auth login --org partner-co` stores a separate credential from `azdo auth login --org myorg`; both remain usable concurrently. Different orgs can use different credential kinds — `partner-co` may be on OAuth while `myorg` stays on PAT (FR-007).

A command targeting an org the user is not authenticated against fails with a clear "log in to `<org>`" error rather than silently using a different org's credential (FR-009).

## OAuth scopes

The default OAuth scope set mirrors the published [PAT scope table](oauth-app-registration.md#pat-scope-table-canonical-source) — the single source of truth for both PAT and OAuth permissions (FR-016):

- `vso.work` — Work Items read
- `vso.work_write` — Work Items read + write
- `vso.code` — Code read (sufficient for PR read on the current command surface)
- `offline_access` — required by Entra to issue a refresh token (FR-004)
- `openid` — required by Entra v2.0 when requesting any v2 resource scope

The CLI **never** requests `vso.full_access` by default. New feature scopes must be added to the PAT scope table first; existing OAuth users will re-consent on next login rather than the CLI silently widening scope (FR-016 hard rule).

To override per-invocation: `azdo auth login --org myorg --scopes "scope-a scope-b scope-c"`.

## Audit log

Every credential-store event is appended to `~/.azdo/audit.log` (JSON lines, `0600`). The vocabulary covers both PAT and OAuth lifecycles:

| Event kind | When |
| --- | --- |
| `auth.store` / `auth.delete` / `auth.validate.ok` / `auth.validate.fail` | PAT lifecycle |
| `oauth-login-started` / `oauth-login-success` / `oauth-login-failed` | OAuth login attempts (with `flow`, `clientIdSource`, `accountId`, `scope`, `tokenLifetimeSec`, `reason`) |
| `oauth-refresh-success` / `oauth-refresh-failed` | Silent-refresh outcomes (with `reason` = `revoked` / `window-exceeded` / `invalid-grant` / `network` / `unknown`) |
| `oauth-logout` | OAuth credential removal |

Token material — access tokens, refresh tokens, raw PATs — is **never** written to the audit log. The CLI strips any caller-supplied `token` / `accessToken` / `refreshToken` / `pat` field before writing as a defence-in-depth measure.

## OS credential store

| OS | Backend |
|----|---------|
| macOS | Keychain |
| Windows | Credential Manager |
| Linux | libsecret / Secret Service (GNOME Keyring / KWallet) |

If the backend is unavailable (e.g. a Linux container without `libsecret` installed), `azdo auth login` exits with a clear diagnostic and **does not** fall back to plaintext file storage (FR-003 hard rule). Linux users may need to install and start a Secret Service daemon — see [`linux-credential-store.md`](linux-credential-store.md).

## CI / headless environments

For ephemeral environments, set the env var to skip the vault entirely:

```bash
export AZDO_PAT=<your-pat>
```

`AZDO_PAT` takes precedence over any stored credential. For OAuth-on-CI use the device-code flow once interactively and then rely on the silent-refresh path until the refresh token expires; or use `AZDO_OAUTH_CLIENT_ID` + `AZDO_OAUTH_TENANT_ID` env vars to point the CLI at your tenant's registered app.

## Project resolution (org / project)

| Priority | Source |
|----------|--------|
| 1 | `--org` + `--project` flags |
| 2 | Auto-detected from the Azure DevOps `origin` git remote |
| 3 | Saved config (`azdo config set org …` / `project …`) |

## See also

- [`oauth-app-registration.md`](oauth-app-registration.md) — register the project's shared OAuth app (maintainer) or your own (locked-down tenant)
- [`linux-credential-store.md`](linux-credential-store.md) — Linux secret-service setup
