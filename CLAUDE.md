# azdo-cli Development Guidelines

Check [AGENTS.md](/workspaces/azdo-cli/AGENTS.md) for the real repository guidance and project memory.

Skills live in `.agents/skills`.

## Recent Changes
- 024-azdo-pipeline: Added TypeScript 5.x (strict) + commander.js, native `fetch` (no new deps)
- 023-pr-comments-status: Added TypeScript 5.x (strict mode) + commander.js, native `fetch` (no new runtime deps)
- 020-auth-docs-sync: Synced the authentication docs (`README.md`, `docs/commands.md`, `docs/linux-credential-store.md`) with the current `develop` auth surface — documented `azdo auth login` (OAuth default) alongside the PAT fallback. Documentation-only; no source or dependency changes (verified against the built CLI's `--help`).

## Active Technologies
- TypeScript 5.x (strict) + commander.js, native `fetch` (no new deps) (024-azdo-pipeline)
- N/A (stateless CLI over ADO REST) (024-azdo-pipeline)
