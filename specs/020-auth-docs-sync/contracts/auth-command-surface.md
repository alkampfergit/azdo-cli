# Contract: Authoritative auth command surface

This is the canonical reference the documentation MUST match (FR-004). It is derived from `src/commands/auth.ts` on `develop` and verified via `node dist/index.js auth --help` (and subcommand `--help`). Any documentation statement about an auth command/flag must agree with this table.

## Commands

### `azdo auth login`
- **Description**: Authenticate against Azure DevOps. **OAuth is the default**; `--use-pat` (or `--from-stdin`) selects the PAT path.
- **Options** (`--org` declared on the subcommand; the rest are inherited from the parent `auth` via `optsWithGlobals()` and are valid on `login`):
  - `--org <name>` — target organisation (else git remote → config)
  - `--use-pat` — use a PAT instead of OAuth (legacy path)
  - `--from-stdin` — read PAT from stdin (implies `--use-pat`)
  - `--no-browser` — do not open the AzDO PAT page (PAT path only)
  - `--device-code` — OAuth device-code flow (headless hosts)
  - `--client-id <id>` — override default OAuth client id
  - `--tenant-id <id>` — override default OAuth tenant id (default: `common`)
  - `--scopes <scopes>` — space-separated OAuth scope override
- **Mutual exclusion (exit code 2)**: `--use-pat` + `--device-code`; `--use-pat` + any of `--client-id` / `--tenant-id` / `--scopes`.

### `azdo auth` (no subcommand)
- **Description**: Legacy PAT-prompt entry point, kept for back-compat. Equivalent to the PAT path of `azdo auth login`.
- **Options**: same option set as `login` (declared on the `auth` command); the root action runs the PAT-prompt flow.

### `azdo auth status`
- **Description**: Report stored credentials (kind `pat`/`oauth`, org, account/expiry for OAuth, keyring backend). **Never prints the token.**
- **Options**: `--org <name>`, `--json`.

### `azdo auth logout`
- **Description**: Remove the stored credential for an org (PAT or OAuth).
- **Options**: `--org <name>`, `--all` (remove every stored credential).

### `azdo clear-pat` (deprecated)
- **Description**: Deprecated alias of `azdo auth logout`. Prints a one-line deprecation notice and removes a stored PAT.
- **Options**: `--org <name>`.

## Environment variables (documented, behaviour unchanged)
- `AZDO_PAT` — PAT taken from env, highest precedence over the vault.
- `AZDO_OAUTH_CLIENT_ID` / `AZDO_OAUTH_TENANT_ID` — point OAuth at a self-registered app.

## Doc-accuracy checklist (per FR-004 / SC-002)
- [ ] Every command above appears in `docs/commands.md` with an accurate description.
- [ ] `azdo auth login` is present and described as OAuth-default in `README.md` and `docs/commands.md`.
- [ ] No doc references a command/flag absent from this contract.
- [ ] `clear-pat` is marked deprecated wherever it appears.
- [ ] Full `auth login` usage (flags) shown where flags are listed — not just `--org`.
