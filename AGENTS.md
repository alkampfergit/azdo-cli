# azdo-cli Agent Notes

`AGENTS.md` is the single source of repository guidance for every agent. `CLAUDE.md` only imports it, so keep rules and project memory here and nothing in `CLAUDE.md`. Agent skills live in `.agents/skills`.

`azdo` is a CLI for Azure DevOps (work items, pull requests, pipelines), written in TypeScript. Per-feature design notes are in [docs/feature-notes.md](docs/feature-notes.md); user-facing release notes are in `docs/changelogs/`.

## Project Structure

```text
src/
  commands/    one file per command group (commander.js)
  services/    Azure DevOps clients, auth, credential store, helpers
  lib/ types/  small shared modules and types
  program.ts   builds the command tree; index.ts only runs it
tests/
  unit/        vitest, no network
  integration/ vitest, opt-in (needs AZDO_* credentials, see docs/development.md)
docs/          command reference, development guide, changelogs, feature notes
specs/         one folder per feature (Spec Kit)
scripts/       dev scripts, version computation, local Sonar check
```

## Commands

- full test suite and linter `npm test && npm run lint`
- unit tests `npm run test:unit`
- integration tests `npm run test:integration`
- SonarCloud rules + duplication, offline `npm run sonar:local` (see `docs/sonar-local.md`)

## Before Every Commit

Run `npm run sonar:local` before every commit that touches `src/`, and fix what it reports. It checks the changed `src/` files against the SonarCloud quality profile and the duplication limit, so the findings show up locally instead of after the push. Use `-- --all` to check every file.

- Do not silence a finding with a suppression comment. If one looks wrong, check it against the real SonarCloud result first (`docs/sonar-local.md`, "Known limits"); `S6594` on `auth.ts` is a known extra.
- A pass does not guarantee a green quality gate: skipped rules and `tests/` are not covered.
- After a SonarCloud profile change, run `npm run sonar:sync` and commit the new `eslint.sonar.rules.json`.

## Code Style

TypeScript 5.x (strict mode) on Node.js LTS: follow standard conventions. Prefer minimal, targeted edits that preserve the existing CLI structure.

## Working Defaults

- Run `npm test && npm run lint` before wrapping up when the change warrants it.
- Use `npm run test:unit` or `npm run test:integration` for focused reruns when full-suite validation is unnecessary.

## Architecture Notes

- For work item writes, the transport layer already accepts an arbitrary JSON Patch operation array via `updateWorkItem()`. Command-level limits are narrower than client-level limits.
- `set-md-field` currently exposes exactly one `<field>` argument and emits two operations for that field: `/fields/<field>` and `/multilineFieldsFormat/<field>` with `Markdown`.

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

<!-- The two sections below are maintained by .specify/scripts/bash/update-agent-context.sh. -->

## Active Technologies

- TypeScript 5.x (strict mode) on Node.js LTS; commander.js (CLI framework); native `fetch` (HTTP); `node:child_process` for git
- `@napi-rs/keyring` (OS credential store: Windows Credential Manager, macOS Keychain, Linux Secret Service), `@primno/dpapi` (Windows DPAPI)
- `node-html-markdown` (HTML to Markdown), `fflate` and `jimp` (attachments and images)
- Storage: `~/.azdo/config.json` for settings; credentials in the OS store. Everything else goes to the Azure DevOps API.
- Tooling: tsup (build), vitest (tests), ESLint + typescript-eslint, Prettier, jscpd and eslint-plugin-sonarjs (local Sonar check)

The stack additions of each feature are in [docs/feature-notes.md](docs/feature-notes.md).

## Recent Changes

The full log of earlier changes, with the design notes, is in [docs/feature-notes.md](docs/feature-notes.md). Spec Kit adds a one-line entry here for each new feature.
