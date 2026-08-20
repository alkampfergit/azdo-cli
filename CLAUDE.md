# azdo-cli Development Guidelines

Check [AGENTS.md](/workspaces/azdo-cli/AGENTS.md) for the real repository guidance and project memory.

Skills live in `.agents/skills`.

## Recent Changes
- 033-pr-comment-authoring (consumer-feedback round): fixed option plumbing on the nested `pr comments add|edit|reply` (commander stores an option on the command that declares it, so the duplicated `--org/--project/--repo/--pr-number/--json` were lost — `--pr-number` silently fell back to the branch's PR); PR `url` is now built instead of always `null`; added `createdByUniqueName`/`createdById`, `--thread`, `--contains`, per-comment `truncated`/`originalLength`, the token source in auth failures, and the credential precedence in `azdo config --help`. New `tests/unit/pr-command-tree.test.ts` drives commands through the real `azdo pr` tree — the isolated-factory suites cannot see option-plumbing bugs.
- 033-pr-comment-authoring: New `azdo pr comments add` / `edit` (create a thread, rewrite a comment in place; `--file`, `--dry-run`, top-level `comment-add` / `comment-edit` aliases), new `azdo pr list` (single-call PR lookup with `--branch` / `--status` / `--top`), `--exclude-system` + `--max-chars` on `pr comments`, `--file` on `pr comments reply`, and `--repo` on every `pr` subcommand. The four `scripts/*_pr_*.ps1` helpers were deleted — Azure DevOps capability ships as CLI commands only. No new dependencies.
- 024-azdo-pipeline: New `azdo pipeline` command group (`list`, `get-runs`, `wait`, `get-run-detail`, `logs`, `start`) over the ADO Pipelines/Build/Test REST APIs. Feature addition within the existing TypeScript 5.x / commander.js / native-`fetch` stack — no new dependencies.
- 023-pr-comments-status: `pr status` now merges branch policy evaluations with status-API checks; `pr comments` gains `--code-related-only` and `--exclude-resolved` (alias of `--hide-resolved`); open/closed code-comment counts in `pr status`. Existing stack; no new dependencies.
- 020-auth-docs-sync: Synced the authentication docs (`README.md`, `docs/commands.md`, `docs/linux-credential-store.md`) with the current `develop` auth surface — documented `azdo auth login` (OAuth default) alongside the PAT fallback. Documentation-only; no source or dependency changes (verified against the built CLI's `--help`).

## Active Technologies
- TypeScript 5.x (strict), commander.js, native `fetch` — unchanged; no new runtime dependencies from recent features.
