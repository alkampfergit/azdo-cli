# azdo-cli Agent Notes

This repository already maintains project memory in [CLAUDE.md](/workspaces/azdo-cli/CLAUDE.md).

For Codex work:
- Treat `CLAUDE.md` as the authoritative project memory and planning summary.
- Do not rewrite, migrate, or duplicate Claude-specific memory unless explicitly asked.
- Add Codex-specific guidance here only when it is truly agent-specific and cannot live in `CLAUDE.md`.

## Codex Memory

- Use this file for Codex-only working memory; keep repository memory in [CLAUDE.md](/workspaces/azdo-cli/CLAUDE.md) and reference it instead of duplicating it here.
- For work item writes, the transport layer already accepts an arbitrary JSON Patch operation array via `updateWorkItem()`. Command-level limits are narrower than client-level limits.
- `set-md-field` currently exposes exactly one `<field>` argument and emits two operations for that field: `/fields/<field>` and `/multilineFieldsFormat/<field>` with `Markdown`.

Working defaults:
- Run `npm test && npm run lint` before wrapping up when the change warrants it.
- Prefer minimal, targeted edits that preserve the existing CLI structure.

## Active Technologies
- TypeScript 5.x (strict mode) on Node.js LTS + commander.js (CLI framework), node-html-markdown (existing rich-text support), node:fs/node:path (built-in file handling); no new parser dependency planned (007-work-item-upsert)
- N/A (reads inline/file input and writes to Azure DevOps API only) (007-work-item-upsert)
- TypeScript 5.x (strict mode) on Node.js LTS + commander.js, built-in `fetch`, built-in `node:child_process`, existing auth/context services (008-pull-request-handling)
- N/A (reads local git state and Azure DevOps APIs only) (008-pull-request-handling)
- TypeScript 5.x (strict mode) on Node.js LTS + commander.js, native `fetch`, existing auth/context helpers, node:fs only where already present (010-work-item-comments)
- N/A (reads from and writes to Azure DevOps Work Item Tracking APIs only) (010-work-item-comments)

## Recent Changes
- 007-work-item-upsert: Added TypeScript 5.x (strict mode) on Node.js LTS + commander.js (CLI framework), node-html-markdown (existing rich-text support), node:fs/node:path (built-in file handling); no new parser dependency planned

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

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

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
