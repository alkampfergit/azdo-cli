# Unreleased

## Agent skill

- `azdo --get-skill` (or `azdo --help --get-skill`) prints a skill that teaches Claude Code, Codex and GitHub Copilot how to use `azdo`: a short `SKILL.md` with the rules for agents (`--json`, explicit `--org`/`--project`/`--repo`, stdin for long text, exit codes, token handling) plus one reference file per area — work items, pull requests, pipelines, relations, authentication. `--out <dir>` writes the skill folder, ready for `~/.claude/skills/azdo`; `--all` prints everything as one document for `AGENTS.md` or `.github/copilot-instructions.md`. The skill is built into the CLI, so it matches the installed version. See `docs/agent-skill.md` (#57).
