# Feature Specification: agent skill for azdo

**Feature Branch**: `feature/062-agent-skill`
**Status**: Approved (issue #57, owner: "ok proceed" on the three-level layout with `--out` / `--all`)

## Problem
Agents (Claude Code, Codex, GitHub Copilot) have no ready-made instructions for driving `azdo`. `docs/commands.md` is a human reference: it lists every option but not how an agent should work (which flags to always pass, exit codes, token handling, which command fits which task). Context7 indexes the reference, not that behaviour.

## Requirements
- **FR-1**: A skill folder `skills/azdo/` with progressive disclosure: `SKILL.md` (front matter `name` / `description`; setup check, rules for agents, task → reference index) and `references/{work-items,pull-requests,pipelines,relations,auth-and-config}.md` with task recipes. Exact option lists stay in `azdo <cmd> --help` and `docs/commands.md` (Context7 `/alkampfergit/azdo-cli`).
- **FR-2**: The files are inlined into `dist/index.js` at build time (tsup text loader), so the skill always matches the installed version and needs no runtime path.
- **FR-3**: `azdo --get-skill` and `azdo --help --get-skill` (any order) print `SKILL.md` to stdout and nothing else, exit 0. It runs before the command tree is parsed, so commander's `--help` cannot answer first and no update notice is printed.
- **FR-4**: `--get-skill --out <dir>` writes `SKILL.md` and `references/*.md` under `<dir>` (directories created, files overwritten) and prints each written path; a write error is exit 1.
- **FR-5**: `--get-skill --all` prints every file as one document, `SKILL.md` without its front matter first, each reference preceded by `<!-- azdo skill: references/<name>.md -->`. `--out` with `--all` is exit 1.
- **FR-6**: `--out` and `--all` are not root options (a root `--all` would capture `azdo pr list --all`-style subcommand flags); `--get-skill` is declared on the root so `azdo --help` lists it.
- **FR-7**: Drift guard: a unit test walks every `azdo …` invocation in the skill files against `createProgram()` and fails on an unknown command, subcommand or option; it also checks that `SKILL.md` links exactly the reference files that exist.
- **FR-8**: `docs/agent-skill.md` explains installation for Claude Code, Codex and Copilot; `docs/commands.md` documents `--get-skill`; README gets one Documentation-table row; `context7.json` excludes `skills/`.

## Out of scope
Separate skills per workflow; publishing the skill to a marketplace; shipping `skills/` as loose files in the npm package (the content is in the bundle).
