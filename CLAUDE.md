# azdo-cli Development Guidelines

Check [AGENTS.md](/workspaces/azdo-cli/AGENTS.md) for the real repository guidance and project memory.

Skills live in `.agents/skills`.

## Recent Changes
- 024-azdo-pipeline: New `azdo pipeline` command group (`list`, `get-runs`, `wait`, `get-run-detail`, `logs`, `start`) over the ADO Pipelines/Build/Test REST APIs. Feature addition within the existing TypeScript 5.x / commander.js / native-`fetch` stack — no new dependencies.
- 023-pr-comments-status: `pr status` now merges branch policy evaluations with status-API checks; `pr comments` gains `--code-related-only` and `--exclude-resolved` (alias of `--hide-resolved`); open/closed code-comment counts in `pr status`. Existing stack; no new dependencies.
- 020-auth-docs-sync: Synced the authentication docs (`README.md`, `docs/commands.md`, `docs/linux-credential-store.md`) with the current `develop` auth surface — documented `azdo auth login` (OAuth default) alongside the PAT fallback. Documentation-only; no source or dependency changes (verified against the built CLI's `--help`).

## Active Technologies
- TypeScript 5.x (strict), commander.js, native `fetch` — unchanged; no new runtime dependencies from recent features.
