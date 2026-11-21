---
name: azdo
description: Use the azdo CLI to read and change Azure DevOps work items, pull requests, pipelines and work item relations from the terminal. Load this when a task mentions Azure DevOps, dev.azure.com, a work item, a pull request in an Azure Repos repository, or a pipeline run.
---

# azdo — Azure DevOps from the command line

`azdo` (npm package `azdo-cli`) wraps the Azure DevOps REST API for work items,
pull requests, pipelines and relations. This file holds the rules that apply to
every command. Read **one** reference file below when the task needs it, and
`azdo <command> --help` for the exact options of a single command.

## Check the setup first

```bash
azdo auth status          # stored credentials, never the token
azdo auth diagnose --json # credential in use, connectivity, and who it belongs to
```

If nothing is stored and `AZDO_PAT` is not set, ask the user to run
`azdo auth login --org <org>` themselves: it opens a browser or prompts for a
token, which an agent cannot complete. Details: `references/auth-and-config.md`.

## Rules for agents

1. **Pass `--json`** whenever the command has it. The JSON goes to stdout as one
   document; errors and notices go to stderr. Without `--json`: `get-md-field`,
   the three attachment commands, `auth token`, `auth login`, `auth logout`.
2. **Name the target explicitly.** Pass `--org` and `--project` (and `--repo`
   for `pr` commands) unless you are sure the git remote or the saved config
   points at the right place. `--org` and `--project` go together.
3. **Send long text through a file or stdin** where the command allows it,
   not as a quoted argument: `--file -`, `--description-file -`,
   `--title-file -`. Only one option per call can read stdin.
4. **Preview before you write** where `--dry-run` exists (`pr comments add`,
   `edit`, `delete`). Write commands that lack it (`set-state`, `set-field`,
   `upsert`, `relations add`) change the work item at once — read it first.
5. **Read the exit code**, not the wording of stderr:

   | Code | Meaning |
   | --- | --- |
   | `0` | success, including a `--dry-run` and an idempotent no-op (`noop: true` in `--json`) |
   | `1` | validation error, ambiguous target, network or other failure |
   | `3` | a named resource does not exist (PR, thread, comment, work item) |
   | `4` | not permitted: authentication failed or permission denied |

   `azdo pipeline wait` is the exception: its exit code is the run result
   (`0` succeeded, `1` failed, `2` canceled, `124` timed out).
6. **Never print, log or commit a token.** `azdo auth token` exists only for
   REST calls the CLI does not wrap; capture it in a variable
   (`TOKEN=$(azdo auth token --org <org>)`) and never echo it.
7. **Compare people on `id` or `uniqueName`**, never on `displayName`.
8. **Do not guess commands.** `azdo login`, `azdo work-item` and `azdo boards`
   do not exist. The CLI cannot merge or complete a pull request.

## Where to look next

| Task | Read |
| --- | --- |
| Read, list, create or update work items; fields, comments, attachments | `references/work-items.md` |
| Open, update, abandon or review pull requests; threads, reviewers, linked work items | `references/pull-requests.md` |
| Find, start, wait for and debug pipeline runs; logs, tests, artifacts | `references/pipelines.md` |
| Parent/child and other links between work items | `references/relations.md` |
| Sign-in, tokens, saved settings, credential order | `references/auth-and-config.md` |

For the full option list and every `--json` shape, run `azdo <command> --help`
or read the command reference (`docs/commands.md` in
https://github.com/alkampfergit/azdo-cli, also on Context7 as
`/alkampfergit/azdo-cli`).
