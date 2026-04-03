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
| `npm test` | Build and run tests with vitest |
| `npm run lint` | Lint source files with ESLint |
| `npm run typecheck` | Type-check with tsc (no emit) |
| `npm run format` | Check formatting with Prettier |

## Utility scripts

### sync-env-to-gh-secrets

Syncs local `.env` entries into GitHub Actions secrets for the current repository:

```bash
./scripts/sync-env-to-gh-secrets.zsh          # sync all keys
./scripts/sync-env-to-gh-secrets.zsh FOO BAR  # sync selected keys
```

The script walks upward from the current directory until it finds a `.env`, then sets each valid `KEY=VALUE` entry with `gh secret set`.
