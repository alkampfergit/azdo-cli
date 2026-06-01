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
| `azdo pr <subcommand>` | Manage pull requests (current branch or by `--pr-number`) | `status`, `open`, `comments`, `comment-resolve`, `comment-reopen`, `--pr-number`, `--hide-resolved`, `--json`, `--org`, `--project` |
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
azdo pr comment-resolve  17 --pr-number 64 # mark thread as resolved (idempotent)
azdo pr comment-reopen   17 --pr-number 64 # reopen a previously resolved thread
```

**`azdo pr status`**
- Lists PRs for the current branch, including Azure DevOps checks
- Shows `Detail: …` for failed/errored checks when description is available
- `--json` includes a `checks` array per PR

**`azdo pr open`**
- Requires `--title` and `--description`
- Always targets `develop`
- Reuses an existing active PR if one already matches the branch and target
- Fails when run from `develop` or when multiple active PRs exist

**`azdo pr comments`**
- Lists every comment thread on the target PR with a bracketed status indicator (`[active]`, `[pending]`, `[resolved]`) next to each thread title
- `--pr-number <N>` targets any PR by numeric id and bypasses the current-branch lookup entirely; invalid numbers and missing PRs fail cleanly with non-zero exit, no crash
- When `--pr-number` is omitted, the active PR is auto-detected as the open PR whose source branch equals `refs/heads/<current branch>`. If zero or more than one open PR matches, the command fails (exit 1) with a message naming the searched branch — pass `--pr-number` to disambiguate. (`pr status` is unaffected: it remains a multi-PR overview that lists all matches.)
- `--hide-resolved` drops threads whose backend state is settled (`fixed`, `wontFix`, `closed`, `byDesign`) — useful when triaging only the threads that still need attention
- Tolerant of Azure DevOps responses that omit `_links.web` (root cause of the original crash reported in issue #34)

**`azdo pr comment-resolve <threadId>`**
- Marks a single comment thread as resolved on the target PR
- Idempotent: exits 0 with a clear "already resolved" message when the thread is already in any settled state (no redundant backend call, `noop:true` in `--json` output)
- Shares `--pr-number`, `--org`, `--project`, and `--json` with `pr comments`

**`azdo pr comment-reopen <threadId>`**
- Mirror of `comment-resolve` — flips any settled thread back to `active`
- Idempotent: exits 0 with "already active" when the thread is already open/pending
- Same flags as `comment-resolve`

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

## JSON output

All commands that produce structured data support `--json`:
`list-fields`, `set-state`, `assign`, `set-field`, `set-md-field`, `upsert`,
`comments list|add`, `pr status|open|comments|comment-resolve|comment-reopen`, `config set|get|list|unset`
