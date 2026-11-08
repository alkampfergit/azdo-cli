# Agent skill

`azdo` ships a skill that teaches coding agents — Claude Code, OpenAI Codex,
GitHub Copilot — how to use the CLI: which flags to always pass, how to read
the exit codes, how to handle tokens, and a recipe for each kind of task. The
skill is built into the installed CLI, so it always matches your version.

## What is in it

The skill uses progressive disclosure: the agent reads the short main file
first and opens one reference only when the task needs it.

```text
azdo/
  SKILL.md                  when to use it, setup check, rules for agents, index
  references/
    work-items.md           get-item, list-items, set-*, upsert, comments, attachments
    pull-requests.md        pr list/status/open/update/abandon, threads, reviewers, work item links
    pipelines.md            runs, wait, failure diagnosis, logs, tests, artifacts
    relations.md            parent/child and other work item links
    auth-and-config.md      credentials, scopes, auth token, org/project resolution
```

For exact options the skill sends the agent to `azdo <command> --help` and to
the [command reference](commands.md), which Context7 serves as
`/alkampfergit/azdo-cli`.

## Getting it

| Command | Output |
| --- | --- |
| `azdo --get-skill` (or `azdo --help --get-skill`) | `SKILL.md` on stdout |
| `azdo --get-skill --out <dir>` | writes `SKILL.md` and `references/` under `<dir>`, prints the paths written |
| `azdo --get-skill --all` | every file as one markdown document, without the front matter, for tools that read a single instructions file |

`--out` creates the folder and overwrites the files, so re-run it after
upgrading `azdo` to refresh the skill. `--out` and `--all` cannot be combined
(exit 1).

## Installing it

### Claude Code

Claude Code loads skills from a folder per skill, reading `references/` on demand.

```bash
azdo --get-skill --out ~/.claude/skills/azdo     # for every project
azdo --get-skill --out .claude/skills/azdo       # for this repository only
```

### OpenAI Codex

Codex reads `AGENTS.md`. Append the whole skill:

```bash
azdo --get-skill --all >> AGENTS.md
```

If your Codex version supports skill folders, `azdo --get-skill --out <skills dir>/azdo`
keeps the progressive layout instead.

### GitHub Copilot

Copilot reads `.github/copilot-instructions.md` for every request, or
`.github/instructions/*.instructions.md` files:

```bash
azdo --get-skill --all >> .github/copilot-instructions.md
# or a separate file
azdo --get-skill --all > .github/instructions/azdo.instructions.md
```

With `--all` every reference is included, so the agent gets the whole skill
in one file; the progressive loading only applies where the tool supports
skill folders.
