# Command Reference

## Cheat Sheet

| Command | Purpose | Common Flags |
| --- | --- | --- |
| `azdo get-item <id>` | Read a work item | `--short`, `--fields`, `--markdown`, `--download-images`, `--resize-images <px>`, `--images-path <dir>`, `--org`, `--project` |
| `azdo set-state <id> <state>` | Change work item state | `--json`, `--org`, `--project` |
| `azdo assign <id> [name]` | Assign or unassign owner | `--unassign`, `--json`, `--org`, `--project` |
| `azdo set-field <id> <field> <value>` | Update any field | `--json`, `--org`, `--project` |
| `azdo upsert [id]` | Create or update from markdown | `--content`, `--file`, `--type`, `--json`, `--org`, `--project` |
| `azdo comments <subcommand>` | Read or add work item comments | `list`, `add`, `--json`, `--org`, `--project` |
| `azdo get-md-field <id> <field>` | Get rich-text field as markdown | `--download-images`, `--resize-images <px>`, `--images-path <dir>`, `--org`, `--project` |
| `azdo set-md-field <id> <field> [content]` | Set markdown field | `--file`, `--json`, `--org`, `--project` |
| `azdo list-fields <id>` | List all fields of a work item | `--json`, `--org`, `--project` |
| `azdo pr <subcommand>` | Manage pull requests (current branch or by `--pr-number`) | `status`, `open`, `comments`, `comment-resolve`, `comment-reopen`, `--pr-number`, `--hide-resolved`, `--exclude-resolved`, `--code-related-only`, `--json`, `--org`, `--project` |
| `azdo pipeline <subcommand>` | Inspect and operate Azure DevOps pipelines | `list`, `get-runs`, `wait`, `get-run-detail`, `logs`, `start`, `--filter`, `--limit`, `--branch`, `--timeout`, `--poll-interval`, `--log-id`, `--parameter`, `--json`, `--org`, `--project` |
| `azdo config <subcommand>` | Manage saved settings | `set`, `get`, `list`, `unset`, `wizard`, `--json` |
| `azdo auth login` | Authenticate against an org — OAuth (Microsoft Entra) by default, or a PAT with `--use-pat` | `--org`, `--use-pat`, `--device-code`, `--client-id`, `--tenant-id`, `--scopes`, `--from-stdin`, `--no-browser` |
| `azdo auth` | Legacy PAT-prompt entry point (back-compat alias of `azdo auth login --use-pat`) | `--org`, `--from-stdin`, `--no-browser` |
| `azdo auth status` | Report stored credentials (kind `pat`/`oauth`, org, account/expiry, backend) — never the token | `--org`, `--json` |
| `azdo auth logout` | Remove the stored credential (PAT or OAuth) for an org, or every org with `--all` | `--org`, `--all` |
| `azdo clear-pat` | **Deprecated** alias for `azdo auth logout` | `--org` |

---

## Core commands

```bash
# Read a work item (full / short / with extra fields)
azdo get-item 12345
azdo get-item 12345 --short
azdo get-item 12345 --fields "System.Tags,Microsoft.VSTS.Common.Priority"

# Convert rich-text fields to markdown
azdo get-item 12345 --markdown
```

### Downloading embedded images

`get-item` and `get-md-field` can download images embedded in a work item's
rich-text fields. Download is **opt-in** — without a flag, no files are written.
Both legacy HTML fields (`<img>`) and native Markdown fields (`![](url)`) are
supported; only images hosted as Azure DevOps attachments are downloaded
(external image URLs are ignored).

```bash
# Download embedded images at original size to the system temp directory
azdo get-item 12345 --download-images

# Cap width at 1024px (aspect preserved, never upscaled) and save as PNG into ./img
azdo get-item 12345 --resize-images 1024 --images-path ./img

# --resize-images implies --download-images
azdo get-item 12345 --resize-images 800

# Same flags work on get-md-field for a single field
azdo get-md-field 12345 System.Description --download-images
```

Notes:
- Default destination is the OS temp directory; override with `--images-path <dir>` (must exist).
- Files are named `wi-<id>-<index><ext>`; resized images are always `.png`.
- A single image failing to download is reported to stderr; the rest still download.

```bash
# Change state
azdo set-state 12345 "Closed"

# Assign / unassign
azdo assign 12345 "someone@company.com"
azdo assign 12345 --unassign

# Set any field by reference name
azdo set-field 12345 System.Title "Updated title"
```

## List fields

```bash
azdo list-fields 12345          # all fields with values (rich text previewed to 5 lines)
azdo list-fields 12345 --json
```

## Markdown field commands

```bash
azdo get-md-field 12345 System.Description
azdo set-md-field 12345 System.Description "# Title\n\nSome **bold** text"
azdo set-md-field 12345 System.Description --file ./description.md
cat description.md | azdo set-md-field 12345 System.Description
```

## Pull request commands

The `pr` group uses the current git branch and the Azure DevOps `origin` remote automatically.
Requires a credential (OAuth or PAT) with **Code (Read)** scope for reads and **Code (Read & Write)** for creation.

```bash
azdo pr status                             # list PRs for current branch + checks
azdo pr open --title "…" --description "…"      # open PR targeting develop
azdo pr comments                           # list threads for current branch's PR
azdo pr comments --pr-number 64            # list threads for any PR by number
azdo pr comments --hide-resolved           # triage view — hide settled threads
azdo pr comments --exclude-resolved        # alias of --hide-resolved
azdo pr comments --code-related-only       # only threads anchored to a file/line
azdo pr comment-resolve  17 --pr-number 64 # mark thread as resolved (idempotent)
azdo pr comment-reopen   17 --pr-number 64 # reopen a previously resolved thread
```

**`azdo pr status`**
- Lists PRs for the current branch, including Azure DevOps checks
- **Checks merge two sources**: the Pull Request Status API *and* branch **policy evaluations** (build validation, required reviewers, etc.). Branch-policy checks are the green checks the Azure DevOps UI shows and are not returned by the status endpoint, so both are combined. Each check carries a `source` of `status` or `policy` in `--json`.
- `Checks: none reported by Azure DevOps` is shown only when both sources are genuinely empty; a retrieval failure shows `Checks: unable to retrieve (…)` instead (never silently "none")
- Shows `Detail: …` for failed/errored checks when description is available
- Shows a `Code comments: N open, M closed` line counting only **code-anchored** (file/line) threads; general discussion threads are excluded
- `--json` includes a `checks` array (with `source`) and a `codeCommentCounts` object per PR

**`azdo pr open`**
- Requires `--title` and `--description`
- Always targets `develop`
- Reuses an existing active PR if one already matches the branch and target
- Fails when run from `develop` or when multiple active PRs exist

**`azdo pr comments`**
- Lists every comment thread on the target PR with a bracketed status indicator (`[active]`, `[pending]`, `[resolved]`) next to each thread title
- `--pr-number <N>` targets any PR by numeric id and bypasses the current-branch lookup entirely; invalid numbers and missing PRs fail cleanly with non-zero exit, no crash
- When `--pr-number` is omitted, the active PR is auto-detected as the open PR whose source branch equals `refs/heads/<current branch>`. If zero or more than one open PR matches, the command fails (exit 1) with a message naming the searched branch — pass `--pr-number` to disambiguate. (`pr status` is unaffected: it remains a multi-PR overview that lists all matches.)
- `--hide-resolved` (and its alias `--exclude-resolved`) drops threads whose backend state is settled (`fixed`, `wontFix`, `closed`, `byDesign`) — useful when triaging only the threads that still need attention
- `--code-related-only` shows only threads anchored to a real file/line, omitting general discussion threads
- The two filters are independent and combinable; with neither flag the output is unchanged. Both are honoured in `--json` output
- Tolerant of Azure DevOps responses that omit `_links.web` (root cause of the original crash reported in issue #34)

**`azdo pr comment-resolve <threadId>`**
- Marks a single comment thread as resolved on the target PR
- Idempotent: exits 0 with a clear "already resolved" message when the thread is already in any settled state (no redundant backend call, `noop:true` in `--json` output)
- Shares `--pr-number`, `--org`, `--project`, and `--json` with `pr comments`

**`azdo pr comment-reopen <threadId>`**
- Mirror of `comment-resolve` — flips any settled thread back to `active`
- Idempotent: exits 0 with "already active" when the thread is already open/pending
- Same flags as `comment-resolve`

## Pipeline commands

Operate Azure DevOps pipelines. Every subcommand supports `--json`, `--org`, and `--project`.
Designed to be scriptable for CI loops and AI coding agents (push → build → wait → read errors → repeat).

```bash
azdo pipeline list                         # list pipeline definitions
azdo pipeline list --filter ci             # filter definitions by name (substring)
azdo pipeline get-runs 12 --limit 5        # recent runs for definition 12
azdo pipeline get-runs 12 --branch develop # runs for a specific branch
azdo pipeline get-runs --commit abc123f    # which runs built this commit?
azdo pipeline get-runs --pr 4664           # runs for a pull request
azdo pipeline wait 3456                     # block until run 3456 finishes (exit code = result)
azdo pipeline get-run-detail 3456          # date, commit, result, errors, failing tests, stages
azdo pipeline logs 3456                     # list a run's logs
azdo pipeline logs 3456 --log-id 7         # print a specific log
azdo pipeline logs 3456 --log-id 7 --tail 50          # only the last 50 lines
azdo pipeline logs 3456 --log-id 7 --grep 'error CS'  # only matching lines
azdo pipeline start 12 --branch develop --parameter env=staging
```

**`azdo pipeline list`**
- Lists pipeline definitions (id + name, and folder when present); `--filter <name>` is a case-insensitive substring match

**`azdo pipeline get-runs [def_id]`**
- Lists recent runs newest-first (run id, state/result, timestamp, branch, abbreviated commit)
- `--limit <n>` caps the count (default 10); `--branch <branch>` restricts to runs for that branch (filtered server-side)
- `--commit <sha>` finds the runs that built a commit (full or abbreviated SHA; matched over the 200 most recent builds); `--pr <number>` lists a pull request's validation runs — with either of these the definition id is optional, so "which run built commit `abc123f`?" is a single call

**`azdo pipeline wait <run_id>`**
- Blocks until the run reaches a terminal state, then sets the **process exit code from the result**: `0` succeeded, `1` failed, `2` canceled, `124` on `--timeout`
- `--timeout <seconds>` (default 1800) bounds the wait; `--poll-interval <seconds>` (default 5) sets the cadence; a timeout does **not** cancel the run
- The exit-code contract makes the AI-agent loop scriptable: `azdo pipeline wait $RID && deploy || azdo pipeline get-run-detail $RID`

**`azdo pipeline get-run-detail <run_id>`**
- Composes the run's core (queue/start/finish times, computed duration, trigger reason, requestor, built commit, result, web link), the build timeline (errors + per-stage **and per-job** status — YAML pipelines often report a single implicit stage, so jobs are the actionable breakdown), and the test summary
- Reports the failing-test count when tests ran, and shows **"no tests present"** distinctly from "0 failures"
- When tests failed, lists the failing tests by name with the first line of each error message (capped at 50) — no need to download the full logs to see what broke
- Degrades gracefully: a source that can't be retrieved is shown as "unavailable" rather than failing the command

**`azdo pipeline logs <run_id>`**
- Lists the run's logs with the step/job each log belongs to (joined from the build timeline), so the right `--log-id` is no longer guesswork; `--log-id <id>` prints a specific log's content to stdout
- With `--log-id`: `--tail <n>` prints only the last N lines, `--grep <pattern>` prints only lines matching a regular expression (grep applies first, then tail) — avoids dumping multi-thousand-line logs to find one error

**`azdo pipeline start <def_id>`**
- Queues a new run and returns its id and link; `--branch <branch>` targets a branch (default: the pipeline's default), `--parameter key=value` (repeatable) passes template parameters
- Pipe the new id straight into `wait`: `RID=$(azdo pipeline start 12 --json | jq .id); azdo pipeline wait $RID`

## Work item comment commands

```bash
azdo comments list 12345
azdo comments list 12345 --json
azdo comments add 12345 "Investigation complete. Working on the fix next."
azdo comments add 12345 "Queued validation run." --json
```

**`azdo comments list`** — prints comments newest-first (ID, author, timestamp, body)

**`azdo comments add`** — requires non-empty text; fails locally before any API call when blank

## azdo upsert

Creates a new work item or updates an existing one from a markdown document.

```bash
# Create a Bug
azdo upsert --type Bug --content $'---\nTitle: Improve markdown import UX\nState: New\n---'

# Update from a file (file is deleted after a successful write)
azdo upsert 12345 --file ./task-import.md

# JSON output
azdo upsert 12345 --content $'---\nSystem.Title: New title\n---' --json
```

Source flags (exactly one required): `--content <markdown>` or `--file <path>`

`--type` defaults to `Task` on create; not valid on update.

### Task document format

```md
---
Title: Improve markdown import UX
Assigned To: user@example.com
State: New
Tags: cli; markdown
Priority: null
---

## Description

Implement a single-command task import flow.

## Acceptance Criteria

- Supports create when no ID is passed
- Supports update when an ID is passed
```

Supported friendly names: `Title`, `Assigned To` / `assignedTo`, `State`, `Description`,
`Acceptance Criteria` / `acceptanceCriteria`, `Tags`, `Priority`.
Raw reference names (e.g. `System.Title`) are also accepted.

`null` or empty YAML fields → clear on update. Empty rich-text sections → clear on update. Omitted fields → untouched.

### JSON output shape

```json
{
  "action": "created",
  "id": 12345,
  "workItemType": "User Story",
  "fields": {
    "System.Title": "Improve markdown import UX"
  }
}
```

## Configuration

```bash
azdo config list
azdo config wizard
azdo config set markdown true
azdo config set fields "System.Tags,Custom.Priority"
azdo config get fields
azdo config unset fields
azdo config list --json
```

## Update notifications

On each command run `azdo` quietly checks the npm registry for a newer **stable**
release and, if one is found, prints a single line to **stderr** after the
command's own output:

```
A new version of azdo-cli is available: 0.5.0 → 0.6.0. Run `npm i -g azdo-cli` to update.
```

The check is best-effort and never blocks or fails your command:

- **Throttled** to at most one registry lookup per 10 minutes (a failed check
  does not reset the window, so the next run may retry).
- **Suppressed** when output is non-interactive (piped, redirected, or in CI),
  so it never pollutes stdout/JSON.
- **Opt-out** with the global `--no-update-check` flag, e.g.
  `azdo --no-update-check get-item 1234`.

## JSON output

All commands that produce structured data support `--json`:
`list-fields`, `set-state`, `assign`, `set-field`, `set-md-field`, `upsert`,
`comments list|add`, `pr status|open|comments|comment-resolve|comment-reopen`, `config set|get|list|unset`
