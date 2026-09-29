# Development

## Prerequisites

- Node.js LTS (20+)
- npm

## Setup

```bash
git clone https://github.com/alkampfergit/azdo-cli.git
cd azdo-cli
npm install
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run build` | Build the CLI with tsup |
| `npm test` | Build and run unit plus integration tests with vitest |
| `npm run test:unit` | Build and run unit tests with vitest |
| `npm run test:integration` | Build and run integration tests with vitest |
| `npm run lint` | Lint source files with ESLint |
| `npm run typecheck` | Type-check with tsc (no emit) |
| `npm run format` | Check formatting with Prettier |

## Dev container tooling

`.devcontainer/postcreate.sh` bootstraps the agent tooling used in this repo.
Two constraints it follows, both enforced by the SonarCloud shell rules:

- Every `curl` installer pins the protocol (`--proto '=https' --tlsv1.2`, held
  once in the `CURL_TLS_ARGS` array at the top of the script), so a redirect
  cannot downgrade a script that is piped straight into a shell.
- Package installs avoid running third-party lifecycle / build scripts:
  `npm install -g ... --ignore-scripts`, and `uv tool install ... --no-build`.

The `--no-build` rule is why **spec-kit is installed from its PyPI release**
(`uv tool install specify-cli --no-build`) rather than from
`git+https://github.com/github/spec-kit.git`: a git source has no wheel, so uv
refuses to install it with building disabled. The PyPI package is the same
project — installing from `main` lands on the pre-release of the same version.
If you need an unreleased spec-kit change, install it yourself with the git
source; do not put the git source back in the bootstrap script without also
dropping `--no-build`.

## Integration test environment

Integration tests hit a real Azure DevOps instance. Create a `.env` file **one directory above the repo root** (e.g. `/workspaces/.env` when the repo lives at `/workspaces/azdo-cli`) with the following variables:

```dotenv
# Required — credentials and target org/project
AZDO_PAT=<your personal access token>
AZDO_ORG=gianmariaricci
AZDO_PROJECT=azdocli

# Required for pull-request tests
AZDO_REPO=azdocli
AZDO_PR_ID=64

# Required for pull-request + build tests
AZDO_PR_ID_WITH_BUILDS=65

# Required for work-item relation tests (read-only; the add/remove round-trip
# creates and links its own scratch work items)
AZDO_WI_WITH_RELATIONS=44920

# Required for attachment tests
AZDO_ATTACHMENT_ITEM_ID=39835
AZDO_ATTACHMENT_FILENAME=_profile.png
```

If the required variables are absent the integration tests are skipped automatically (they do not fail).

`AZDO_PAT` and `AZDO_REPO` have no built-in defaults and must always be set explicitly. All other variables fall back to the values shown above when absent. The PAT needs at minimum the **Work Items (read/write)** and **Code (read)** scopes; to run the PR thread write tests (`patchThreadStatus`) also add the **Code (write)** scope and set `AZDO_REPO`.

## Utility scripts

### sync-env-to-gh-secrets

Syncs local `.env` entries into GitHub Actions secrets for the current repository:

```bash
./scripts/sync-env-to-gh-secrets.zsh          # sync all keys
./scripts/sync-env-to-gh-secrets.zsh FOO BAR  # sync selected keys
```

The script walks upward from the current directory until it finds a `.env`, then sets each valid `KEY=VALUE` entry with `gh secret set`.

### get-secret / set-secret

The integration-test `.env` is kept in the team's Azure Key Vault. Download it
to its usual location — one directory above the repo root, outside git (see
[Integration test environment](#integration-test-environment)):

```bash
./scripts/get-secret.sh              # writes ../.env relative to the repo root
./scripts/get-secret.sh path/to/.env # or an explicit destination
```

Upload the local `.env` back after changing it:

```bash
./scripts/set-secret.sh              # reads the same ../.env
./scripts/set-secret.sh path/to/.env # or an explicit file
```

Key Vault has no separate "update" verb: `set-secret.sh` creates a new current
version of the secret, and previous versions remain retrievable. It refuses to
run if the file is missing or empty, so a stray invocation cannot blank the
secret.

Both scripts require the [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
and prompt for a device-code login if you are not signed in. Reading needs the
**Key Vault Secrets User** role on the `alk-agent-vault` vault; writing needs
**Key Vault Secrets Officer** (or an access policy granting `secrets/set`).
Override the defaults with `AZDO_CLI_VAULT_NAME` and `AZDO_CLI_SECRET_NAME` if
your secret lives elsewhere.

On Windows, write the `.env` with LF line endings before uploading — CRLF is
stored verbatim and comes back with a trailing `\r` on every value.

The dev container installs the Azure CLI via the
`ghcr.io/devcontainers/features/azure-cli` feature, so `az` is available there
out of the box.
