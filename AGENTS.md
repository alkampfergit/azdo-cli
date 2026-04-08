# azdo-cli Agent Notes

`AGENTS.md` is the authoritative repository memory and agent guidance file for this project.

## Repository Memory

### Active Technologies
- TypeScript 5.x (strict mode) on Node.js LTS (18+) + commander.js (existing), @napi-rs/keyring (new - cross-platform OS credential store) (002-get-item-command)
- Cross-platform OS credential store via @napi-rs/keyring for PAT persistence: Windows Credential Manager, macOS Keychain, Linux Secret Service (002-get-item-command)
- TypeScript 5.x (strict mode) + commander.js (CLI framework, existing), node:fs and node:path (config file I/O, built-in) (003-cli-settings)
- JSON file at `~/.azdo/config.json` via `node:fs` (003-cli-settings)
- TypeScript 5.x (strict mode) + commander.js (CLI framework), @napi-rs/keyring (credential store) - both existing (004-update-work-item)
- N/A (no local storage; updates go to Azure DevOps API) (004-update-work-item)
- TypeScript 5.x (strict mode) on Node.js LTS + commander.js (CLI framework), node-html-markdown (HTML→MD conversion, zero deps, native TS) (005-md-field-commands)
- N/A (reads/writes to Azure DevOps API) (005-md-field-commands)
- TypeScript 5.x (strict mode) + commander.js (CLI framework), node-html-markdown (HTML→MD, existing) (006-auto-md-display)
- `~/.azdo/config.json` (existing config file, new `markdown` boolean key) (006-auto-md-display)
- TypeScript 5.x (strict mode) on Node.js LTS + commander.js (CLI framework), node-html-markdown (existing rich-text support), node:fs/node:path (built-in file handling); no new parser dependency planned (007-work-item-upsert)
- N/A (reads inline/file input and writes to Azure DevOps API only) (007-work-item-upsert)
- TypeScript 5.x (strict mode), Node.js LTS (18+) + commander.js (CLI), native `fetch` (HTTP), `node:child_process` execSync (git commands) - all existing (008-pull-request-handling)
- N/A (reads and writes to Azure DevOps API only) (008-pull-request-handling)
- TypeScript 5.x (strict mode) on Node.js LTS + commander.js, built-in `fetch`, built-in `node:child_process`, existing auth/context services (008-pull-request-handling)
- N/A (reads local git state and Azure DevOps APIs only) (008-pull-request-handling)
- TypeScript 5.x (strict mode) on Node.js LTS + commander.js, native `fetch`, existing auth/context helpers, node:fs only where already present (010-work-item-comments)
- N/A (reads from and writes to Azure DevOps Work Item Tracking APIs only) (010-work-item-comments)
- TypeScript 5.x (strict mode), Node.js LTS (18+) + commander.js (CLI), node-html-markdown (HTML→MD conversion) (012-fix-markdown-field-formatting)
- TypeScript 5.x (strict mode), Node.js LTS (18+) + commander.js (CLI), node-html-markdown (HTML→MD, existing) (013-comments-markdown)
- N/A - reads/writes Azure DevOps REST API only (013-comments-markdown)
- TypeScript 5.x (strict mode) on Node.js LTS (18+) + commander.js (CLI framework), native `fetch` (HTTP) (014-work-item-attachments)
- N/A (reads from Azure DevOps API, writes binary files to local filesystem) (014-work-item-attachments)
- TypeScript 5.x (strict mode) on Node.js LTS + commander.js (CLI framework), tsup (bundler) (001-azdo-cli-base)

### Project Structure

```text
src/
tests/
```

### Commands

- full test suite and linter `npm test && npm run lint`
- unit tests `npm run test:unit`
- integration tests `npm run test:integration`

### Code Style

TypeScript 5.x (strict mode) on Node.js LTS: Follow standard conventions.

### Recent Changes
- 008-pull-request-handling: Added TypeScript 5.x (strict mode), Node.js LTS (18+) + commander.js (CLI), native `fetch` (HTTP), `node:child_process` execSync (git commands) - all existing
- 007-work-item-upsert: Added TypeScript 5.x (strict mode) on Node.js LTS + commander.js (CLI framework), node-html-markdown (existing rich-text support), node:fs/node:path (built-in file handling); no new parser dependency planned
- 006-auto-md-display: Added TypeScript 5.x (strict mode) + commander.js (CLI framework), node-html-markdown (HTML→MD, existing)
- 005-md-field-commands: Added TypeScript 5.x (strict mode) on Node.js LTS + commander.js (CLI framework), node-html-markdown (HTML→MD conversion, zero deps, native TS)

## Codex Memory

- Keep repository memory here rather than in `CLAUDE.md`.
- For work item writes, the transport layer already accepts an arbitrary JSON Patch operation array via `updateWorkItem()`. Command-level limits are narrower than client-level limits.
- `set-md-field` currently exposes exactly one `<field>` argument and emits two operations for that field: `/fields/<field>` and `/multilineFieldsFormat/<field>` with `Markdown`.
- Skills are available under `.agents/skills`.

Working defaults:
- Run `npm test && npm run lint` before wrapping up when the change warrants it.
- Use `npm run test:unit` or `npm run test:integration` for focused reruns when full-suite validation is unnecessary.
- Prefer minimal, targeted edits that preserve the existing CLI structure.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking - do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge - do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
