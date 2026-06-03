# azdo-cli Development Guidelines

Check [AGENTS.md](/workspaces/azdo-cli/AGENTS.md) for the real repository guidance and project memory.

Skills live in `.agents/skills`.

## Recent Changes
- 023-pr-comments-status: Added TypeScript 5.x (strict mode) + commander.js, native `fetch` (no new runtime deps)
- 020-auth-docs-sync: Synced the authentication docs (`README.md`, `docs/commands.md`, `docs/linux-credential-store.md`) with the current `develop` auth surface — documented `azdo auth login` (OAuth default) alongside the PAT fallback. Documentation-only; no source or dependency changes (verified against the built CLI's `--help`).
- 017-pr-comments-threads: Fixed `azdo pr comments` crash (tolerant `_links`, libuv-safe exit). Added `--pr-number <N>`, `--hide-resolved`, and `pr comment-resolve` / `pr comment-reopen` subcommands. No new runtime deps; kept the existing TypeScript 5.x / commander.js / native `fetch` stack.

## Active Technologies
- TypeScript 5.x (strict mode) + commander.js, native `fetch` (no new runtime deps) (023-pr-comments-status)
- N/A (stateless CLI; reads Azure DevOps REST) (023-pr-comments-status)
