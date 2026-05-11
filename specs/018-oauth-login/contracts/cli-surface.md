# Contract: CLI surface (`azdo login` / `logout` / `auth status`)

**Branch**: `018-oauth-login`

This document captures the concrete user-visible CLI shape after the feature ships. It is the contract the help text and the manual / quickstart steps depend on. The shape stays inside the existing `azdo auth` command tree (existing `src/commands/auth.ts`).

## `azdo auth login`

```text
azdo auth login [--org <org>] [--use-pat] [--device-code] [--from-stdin] [--browser]
                [--client-id <id>] [--tenant-id <id>] [--scopes <space-sep>]
```

Defaults the user touches most:

- No flags: OAuth, browser-based, default project-shipped client id, scopes per FR-016.
- `--use-pat`: PAT prompt path (existing behaviour, unchanged).
- `--device-code`: forces device-code OAuth flow regardless of browser detection (FR-005).
- `--from-stdin`: PAT path only (existing); ignored with a warning if combined with OAuth flags.

OAuth-only flags:

- `--client-id <id>`: per-invocation override of the default project-owned client id (FR-013). Persists for the duration of the login only.
- `--tenant-id <id>`: tenant override (default `organizations`).
- `--scopes <space-sep>`: space-separated OAuth scope override. Power-user surface; default scope set is the FR-016 mirror of the PAT scope table.

PAT-only flags (existing):

- `--from-stdin`, `--browser`.

Mutual exclusion (CLI rejects with exit code `2`, message to stderr):

- `--use-pat` + `--device-code` (PAT has no device-code flow).
- `--use-pat` + any of `--client-id`, `--tenant-id`, `--scopes`.

Outcome streams:

- stdout: empty by default; the user-visible "logged in to `<org>`" line goes to stderr to match the existing pattern.
- stderr: progress lines ("opening browser…", "waiting for callback at http://127.0.0.1:<port>…", device-code user code + verification URL, success / failure summary).
- exit codes: `0` success, `1` general failure, `2` invalid arguments / mutual-exclusion violation.

## `azdo auth logout`

```text
azdo auth logout [--org <org>] [--all]
```

- `--org <org>`: remove the credential for that org only (FR-006).
- `--all`: remove every stored AzDO credential — both PAT and OAuth — but never anything outside the `azdo-cli` keyring service.
- Default (no flag): same as `--org` against the resolved current org context (existing `org-resolver`).

Outcome:

- stderr: `removed <kind> credential for <org>` per removed entry.
- exit code: `0` if at least one entry was removed (or no entry existed and that's not an error); `1` if the keyring backend was unavailable.

## `azdo auth status`

```text
azdo auth status [--json]
```

- Default: a human-readable table to stdout (org, kind, account/expiry, backend).
- `--json`: machine-readable JSON to stdout matching the `StatusReport` shape in `contracts/auth-service.md`.

Status MUST NOT print token material. For OAuth credentials, expiry is shown as ISO-8601 in the user's local timezone; if expiry has passed, status notes "expired — silent refresh on next command".

## Help-text invariants

- `azdo auth login --help` MUST link to `docs/oauth-app-registration.md` (FR-015) in the long help body, with the line: "to use a self-registered OAuth app, see <link>; to register the project's shared app yourself, that same guide is the maintainer reference."
- `azdo auth login --help` MUST list the FR-016 scope set the default flow requests, so a user can audit before consenting.
- `azdo auth status --help` MUST mention that `kind: 'pat'` and `kind: 'oauth'` may coexist across orgs (FR-007).

## Backwards-compatibility surface

- `azdo auth login` with no flags previously prompted for a PAT. Post-feature it opens the browser. **This is a deliberate behaviour change driven by FR-012 (owner-approved).**
- Users who scripted `azdo auth login --from-stdin <pat>` keep that exact command (it implies `--use-pat`).
- Users with an existing PAT in the keyring continue to authenticate against AzDO with no extra step (read path tolerates the legacy bare-string envelope per the migration rule).
