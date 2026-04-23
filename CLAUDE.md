# azdo-cli Development Guidelines

Check [AGENTS.md](/workspaces/azdo-cli/AGENTS.md) for the real repository guidance and project memory.

Skills live in `.agents/skills`.

## Recent Changes
- 017-pr-comments-threads: Fixed `azdo pr comments` crash (tolerant `_links`, libuv-safe exit). Added `--pr-number <N>`, `--hide-resolved`, and `pr comment-resolve` / `pr comment-reopen` subcommands. No new runtime deps; kept the existing TypeScript 5.x / commander.js / native `fetch` stack.
