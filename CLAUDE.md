# azdo-cli Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-05

## Active Technologies
- TypeScript 5.x (strict mode) on Node.js LTS (18+) + commander.js (existing), @napi-rs/keyring (new - Windows Credential Manager) (002-get-item-command)
- Windows Credential Manager via @napi-rs/keyring for PAT persistence (002-get-item-command)
- TypeScript 5.x (strict mode) + commander.js (CLI framework, existing), node:fs and node:path (config file I/O, built-in) (003-cli-settings)
- JSON file at `~/.azdo/config.json` via `node:fs` (003-cli-settings)
- TypeScript 5.x (strict mode) + commander.js (CLI framework), @napi-rs/keyring (credential store) - both existing (004-update-work-item)
- N/A (no local storage; updates go to Azure DevOps API) (004-update-work-item)

- TypeScript 5.x (strict mode) on Node.js LTS + commander.js (CLI framework), tsup (bundler) (001-azdo-cli-base)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x (strict mode) on Node.js LTS: Follow standard conventions

## Recent Changes
- 004-update-work-item: Added TypeScript 5.x (strict mode) + commander.js (CLI framework), @napi-rs/keyring (credential store) - both existing
- 003-cli-settings: Added TypeScript 5.x (strict mode) + commander.js (CLI framework, existing), node:fs and node:path (config file I/O, built-in)
- 002-get-item-command: Added TypeScript 5.x (strict mode) on Node.js LTS (18+) + commander.js (existing), @napi-rs/keyring (new - Windows Credential Manager)


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
