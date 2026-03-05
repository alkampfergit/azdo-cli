# azdo-cli Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-05

## Active Technologies
- TypeScript 5.x (strict mode) on Node.js LTS (18+) + commander.js (existing), @napi-rs/keyring (new - Windows Credential Manager) (002-get-item-command)
- Windows Credential Manager via @napi-rs/keyring for PAT persistence (002-get-item-command)

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
- 002-get-item-command: Added TypeScript 5.x (strict mode) on Node.js LTS (18+) + commander.js (existing), @napi-rs/keyring (new - Windows Credential Manager)

- 001-azdo-cli-base: Added TypeScript 5.x (strict mode) on Node.js LTS + commander.js (CLI framework), tsup (bundler)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
