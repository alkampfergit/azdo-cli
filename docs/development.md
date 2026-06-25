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

# Required for work-item relation tests
AZDO_WI_WITH_RELATIONS=44920
AZDO_WI_RELATION_SOURCE=44920
AZDO_WI_RELATION_TARGET=44922

# Required for attachment tests
AZDO_ATTACHMENT_ITEM_ID=39835
AZDO_ATTACHMENT_FILENAME=_profile.png
```

If the required variables are absent the integration tests are skipped automatically (they do not fail). The PAT needs at minimum the **Work Items (read/write)** and **Code (read)** scopes.

## Utility scripts

### sync-env-to-gh-secrets

Syncs local `.env` entries into GitHub Actions secrets for the current repository:

```bash
./scripts/sync-env-to-gh-secrets.zsh          # sync all keys
./scripts/sync-env-to-gh-secrets.zsh FOO BAR  # sync selected keys
```

The script walks upward from the current directory until it finds a `.env`, then sets each valid `KEY=VALUE` entry with `gh secret set`.
