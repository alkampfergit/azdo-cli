# azdo-cli

A command-line interface for Azure DevOps.

[![npm version](https://img.shields.io/npm/v/azdo-cli)](https://www.npmjs.com/package/azdo-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Installation

```bash
npm install -g azdo-cli
```

## Usage

```bash
# Show help
azdo --help

# Show version
azdo --version
azdo -v
```

## Current Status

This project is in early development (v0.2.0). The base CLI scaffold is in place with support for `--help` and `--version`. Azure DevOps commands (work items, pipelines, repos, etc.) will be added in future releases.

## Development

### Prerequisites

- Node.js LTS (20+)
- npm

### Setup

```bash
git clone https://github.com/alkampfergit/azdo-cli.git
cd azdo-cli
npm install
```

### Scripts

| Command | Description |
| --- | --- |
| `npm run build` | Build the CLI with tsup |
| `npm test` | Run tests with vitest |
| `npm run lint` | Lint source files with ESLint |
| `npm run typecheck` | Type-check with tsc (no emit) |
| `npm run format` | Check formatting with Prettier |

### Tech Stack

- **TypeScript 5.x** (strict mode, ES modules)
- **commander.js** — CLI framework
- **tsup** — Bundler (single-file ESM output)
- **vitest** — Test runner
- **ESLint + Prettier** — Linting and formatting

### Branch Strategy

This project follows **GitFlow**:

- `master` — stable releases
- `develop` — integration branch
- `feature/*` — feature branches off `develop`

## License

[MIT](LICENSE)
