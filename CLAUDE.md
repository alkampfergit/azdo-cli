# azdo-cli Development Guidelines

Check [AGENTS.md](/workspaces/azdo-cli/AGENTS.md) for the real repository guidance and project memory.

Skills live in `.agents/skills`.

## Recent Changes
- 020-auth-docs-sync: Added N/A for this change — documentation only (the project is TypeScript 5.x / Node.js LTS / commander.js). + None added. Verification uses the existing build (`tsup`) to run the CLI's `--help` output as ground truth.
- 017-pr-comments-threads: Fixed `azdo pr comments` crash (tolerant `_links`, libuv-safe exit). Added `--pr-number <N>`, `--hide-resolved`, and `pr comment-resolve` / `pr comment-reopen` subcommands. No new runtime deps; kept the existing TypeScript 5.x / commander.js / native `fetch` stack.

## Active Technologies
- N/A for this change — documentation only (the project is TypeScript 5.x / Node.js LTS / commander.js). + None added. Verification uses the existing build (`tsup`) to run the CLI's `--help` output as ground truth. (020-auth-docs-sync)
