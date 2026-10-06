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

## Testing a branch build from npm

Every push to any branch (not only `master`/`develop`) runs the `publish` job in
`ci.yml` once `build` and `integration-tests` pass. A feature branch publishes
`<next-minor>-<branch>.<run>` (e.g. `0.22.0-feature-052-pipeline-logs-glued-progress.812`)
under the shared `dev` dist-tag; `develop` publishes `-develop.<run>` under `dev` too,
`release/*` under `next`, and `master` under `latest`.

```
npm install -g azdo-cli@dev                    # newest build from any branch
npm install -g azdo-cli@<exact-version>        # a specific branch build
```

Because `dev` is shared, use the exact version from the `Publish to npm` step of the
CI run when several branches are in flight. To republish without a new commit, re-run
the workflow's `publish` job from the Actions tab. A manual `workflow_dispatch` run
without a pull request number builds and tests but does not publish.

## Testing a pull request from npm

A maintainer can publish a preview of one open pull request and anyone can then install it:

```
npm i -g azdo-cli@pr-134
```

Start it from **Actions > CI > Run workflow** (use the default branch and type the PR number), or:

```
gh workflow run ci.yml -f pr=134
```

The run validates the number, requires the PR to be open, pins its head commit, runs lint, typecheck, build, unit and integration tests on it, and only then publishes `<next-minor>-pr.<number>.<run>` (e.g. `0.22.0-pr.134.57`) under the dist-tag `pr-<number>`. `latest` is never touched. The version and install command appear in the run's job summary. The version comes from git tags via `scripts/compute-version.sh --pr <number> <run>`, run from the dispatched ref, never from the PR.

The job that holds the npm publish permission (`publish-preview`) executes no PR code: `package-preview` builds and packs a tarball without that permission, and `publish-preview` only verifies the tarball's name and version and publishes it. `package-preview` installs and packs with `--ignore-scripts`, so no PR lifecycle script runs there, and a preview run uses no npm cache in any job, so PR code cannot poison the cache that default-branch runs restore.

**Fork PRs:** the tests still execute the PR's code with the Azure DevOps secrets available. Read every change in a fork PR before dispatching.

`npm-tag-cleanup.yml` runs weekly (and on demand) and removes the `pr-<number>` dist-tag of every closed or merged PR; a tag is kept when the PR is open or its state cannot be read. Preview versions stay on npm. It authenticates with an `NPM_TOKEN` repository secret (a granular npm token with read and write access to `azdo-cli` only), because the trusted publisher cannot remove tags. The `ci.yml` trusted publisher is unchanged. The schedule only fires once the workflow is on the default branch.
