# Quickstart: AzDO CLI Base

**Branch**: `001-azdo-cli-base` | **Date**: 2026-03-05

## Prerequisites

- Node.js LTS (v20+)
- npm 9+

## Setup

```bash
# Clone and checkout the feature branch
git clone <repo-url>
cd azdo-cli
git checkout 001-azdo-cli-base

# Install dependencies
npm install
```

## Development

```bash
# Build the CLI (single bundled file)
npm run build

# Run locally without installing
node dist/index.js --version
node dist/index.js --help

# Run tests
npm test

# Lint and type-check
npm run lint
npm run typecheck
```

## Local Testing (as global CLI)

```bash
# Link the package locally to test the `azdo` command
npm link

# Test the CLI
azdo --version    # Should output: 0.1.0
azdo --help       # Should display help
azdo              # Should display help (no args)
azdo --foo        # Should show error + help, exit 1

# Unlink when done
npm unlink -g azdo-cli
```

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | CLI entry point — commander.js program setup |
| `src/version.ts` | Version reading from package.json |
| `tests/unit/cli.test.ts` | Unit tests for all CLI behaviors |
| `tsup.config.ts` | Bundler configuration — single file output |
| `.github/workflows/ci.yml` | CI/CD pipeline — build, publish, release |
| `package.json` | Package metadata, bin mapping, scripts |
| `tsconfig.json` | TypeScript strict configuration |

## Build Output

After `npm run build`, the `dist/` directory contains a single `index.js` file with a `#!/usr/bin/env node` shebang. This is the file that npm maps to the `azdo` command via the `bin` field in `package.json`.
