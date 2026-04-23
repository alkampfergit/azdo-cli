# Authentication

## Overview

`azdo-cli` authenticates against Azure DevOps using a Personal Access Token (PAT). PATs are stored per Azure DevOps organization in the OS-native secret vault and picked up automatically by every `azdo` command.

## PAT resolution order

1. `AZDO_PAT` environment variable (wins when set and non-empty).
2. Stored credential for the resolved org, from the OS secret vault.
3. `AZDO_PAT` entry in a `.env` file walking up from the current directory.

If no PAT is found, commands exit with a clear error suggesting `azdo auth --org <name>`. No silent mid-command prompt.

## Organization resolution order

Every command (including `azdo auth`) resolves the target Azure DevOps organization using:

1. `--org <name>` flag.
2. Auto-detect from the current working context (git remote `origin`, when it points at `dev.azure.com/<org>` or `<org>.visualstudio.com`).
3. Persistent default from `azdo config set org <name>` (`~/.azdo/config.json`).
4. Error with a single-line diagnostic naming each step.

`--org` always wins; the working-context git remote wins over a persistent config default so `cd`-ing into a different org's repo "just works".

## Storing a PAT

```bash
# Interactive — opens the Azure DevOps PAT page, prompts for the token (masked), validates, stores.
azdo auth --org myorg

# Non-interactive (for provisioning / CI):
echo "<pat>" | azdo auth --org myorg --from-stdin

# Skip the browser assist:
azdo auth --org myorg --no-browser
```

PATs are validated against `GET https://dev.azure.com/<org>/_apis/projects?$top=1` before being stored — an invalid PAT is never written to the vault.

## Inspecting / removing

```bash
# Check what's stored (masked identifier, never the full PAT):
azdo auth status --org myorg
azdo auth status --org myorg --json

# Remove a single org's PAT:
azdo auth logout --org myorg

# Remove every stored PAT:
azdo auth logout --all
```

The legacy `azdo clear-pat` command still works but is deprecated — it prints a one-line deprecation notice and calls the same service as `azdo auth logout`.

## Multi-org

Each org has its own stored PAT. `azdo auth --org partner-co` stores a separate credential from `azdo auth --org myorg`; both remain usable concurrently.

## Audit log

Every credential-store event (store, delete, validate ok / fail) is appended to `~/.azdo/audit.log` (JSON lines, `0600`). Each line contains the org, backend, timestamp, and a masked identifier — the full PAT is never written anywhere outside the OS vault.

## OS credential store

| OS | Backend |
|----|---------|
| macOS | Keychain |
| Windows | Credential Manager |
| Linux | libsecret / Secret Service (GNOME Keyring / KWallet) |

If the backend is unavailable (e.g. a Linux container without `libsecret` installed), `azdo auth` exits with a clear diagnostic and **does not** fall back to plaintext file storage. Linux users may need to install and start a Secret Service daemon — see [linux-credential-store.md](linux-credential-store.md).

## CI / headless environments

For ephemeral environments, skip the vault entirely and set the env var:

```bash
export AZDO_PAT=<your-pat>
```

`AZDO_PAT` takes precedence over any stored credential.

## Project resolution (org / project)

| Priority | Source |
|----------|--------|
| 1 | `--org` + `--project` flags |
| 2 | Auto-detected from the Azure DevOps `origin` git remote |
| 3 | Saved config (`azdo config set org …` / `project …`) |
