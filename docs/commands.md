# Command Reference

## Cheat Sheet

| Command | Purpose | Common Flags |
| --- | --- | --- |
| `azdo get-item <id>` | Read a work item | `--short`, `--fields`, `--markdown`, `--org`, `--project` |
| `azdo set-state <id> <state>` | Change work item state | `--json`, `--org`, `--project` |
| `azdo assign <id> [name]` | Assign or unassign owner | `--unassign`, `--json`, `--org`, `--project` |
| `azdo set-field <id> <field> <value>` | Update any field | `--json`, `--org`, `--project` |
| `azdo upsert [id]` | Create or update from markdown | `--content`, `--file`, `--type`, `--json`, `--org`, `--project` |
| `azdo comments <subcommand>` | Read or add work item comments | `list`, `add`, `--json`, `--org`, `--project` |
| `azdo get-md-field <id> <field>` | Get rich-text field as markdown | `--org`, `--project` |
| `azdo set-md-field <id> <field> [content]` | Set markdown field | `--file`, `--json`, `--org`, `--project` |
| `azdo list-fields <id>` | List all fields of a work item | `--json`, `--org`, `--project` |
| `azdo pr <subcommand>` | Manage pull requests for the current branch | `status`, `open`, `comments`, `--json`, `--org`, `--project` |
| `azdo config <subcommand>` | Manage saved settings | `set`, `get`, `list`, `unset`, `wizard`, `--json` |
| `azdo clear-pat` | Remove stored PAT | none |

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
Requires a PAT with **Code (Read)** scope for reads and **Code (Read & Write)** for creation.

```bash
azdo pr status                          # list PRs for current branch + checks
azdo pr open --title "…" --description "…"   # open PR targeting develop
azdo pr comments                        # active review comments for current branch's PR
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
- Returns only active/pending threads with visible, non-deleted comments
- Groups output by thread; shows file context when available

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
`comments list|add`, `pr status|open|comments`, `config set|get|list|unset`
