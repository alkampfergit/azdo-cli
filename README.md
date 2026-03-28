# azdo-cli

Azure DevOps CLI focused on work item read/write workflows.

[![npm version](https://img.shields.io/npm/v/azdo-cli)](https://www.npmjs.com/package/azdo-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=alkampfergit_azdo-cli&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=alkampfergit_azdo-cli)

## Features

- Retrieve work items with readable output (`get-item`)
- Update work item state (`set-state`)
- Assign and unassign work items (`assign`)
- Set any work item field by reference name (`set-field`)
- Create or update Tasks from markdown documents (`upsert`)
- Read rich-text fields as markdown (`get-md-field`)
- Set rich-text fields as markdown from inline text, file, or stdin (`set-md-field`)
- Check branch pull request status, open PRs to `develop`, and review active comments (`pr`)
- Persist org/project/default fields in local config (`config`)
- List all fields of a work item (`list-fields`)
- Store PAT in OS credential store (or use `AZDO_PAT`)

## Installation

```bash
npm install -g azdo-cli
```

## Utility Scripts

The repository also includes a helper script for syncing local `.env` entries into GitHub Actions secrets for the current repository:

```bash
./scripts/sync-env-to-gh-secrets.zsh
```

It walks upward from the current directory until it finds a `.env`, then sets each valid `KEY=VALUE` entry with `gh secret set`. You can also limit the sync to selected keys:

```bash
./scripts/sync-env-to-gh-secrets.zsh FOO BAR
```

## Authentication and Context Resolution

PAT resolution order:
1. `AZDO_PAT` environment variable
2. Stored credential from OS keyring
3. Interactive PAT prompt (then stored for next runs)

Org/project resolution order:
1. `--org` + `--project` flags
2. Saved config (`azdo config set org ...`, `azdo config set project ...`)
3. Azure DevOps `origin` git remote auto-detection

## Quick Start

```bash
# 1) Configure defaults once
azdo config set org myorg
azdo config set project myproject

# 2) Read a work item
azdo get-item 12345

# 3) Update state
azdo set-state 12345 "Active"

# 4) Create or update a Task from markdown
azdo upsert --content $'---\nTitle: Improve markdown import UX\nState: New\n---'
```

## Command Cheat Sheet

| Command | Purpose | Common Flags |
| --- | --- | --- |
| `azdo get-item <id>` | Read a work item | `--short`, `--fields`, `--markdown`, `--org`, `--project` |
| `azdo set-state <id> <state>` | Change work item state | `--json`, `--org`, `--project` |
| `azdo assign <id> [name]` | Assign or unassign owner | `--unassign`, `--json`, `--org`, `--project` |
| `azdo set-field <id> <field> <value>` | Update any field | `--json`, `--org`, `--project` |
| `azdo upsert [id]` | Create or update a Task from markdown | `--content`, `--file`, `--json`, `--org`, `--project` |
| `azdo get-md-field <id> <field>` | Get field as markdown | `--org`, `--project` |
| `azdo set-md-field <id> <field> [content]` | Set markdown field | `--file`, `--json`, `--org`, `--project` |
| `azdo list-fields <id>` | List all fields of a work item | `--json`, `--org`, `--project` |
| `azdo pr <subcommand>` | Manage pull requests for the current branch | `status`, `open`, `comments`, `--json`, `--org`, `--project` |
| `azdo config <subcommand>` | Manage saved settings | `set`, `get`, `list`, `unset`, `wizard`, `--json` |
| `azdo clear-pat` | Remove stored PAT | none |

## Command Reference

### Core

```bash
# Get full work item
azdo get-item 12345

# Get short view
azdo get-item 12345 --short

# Include extra fields for this call
azdo get-item 12345 --fields "System.Tags,Microsoft.VSTS.Common.Priority"

# Convert rich text fields to markdown
azdo get-item 12345 --markdown

```

```bash
# Set state
azdo set-state 12345 "Closed"

# Assign / unassign
azdo assign 12345 "someone@company.com"
azdo assign 12345 --unassign

# Set generic field
azdo set-field 12345 System.Title "Updated title"
```

### List Fields

```bash
# List all fields with values (rich text fields preview first 5 lines)
azdo list-fields 12345

# JSON output
azdo list-fields 12345 --json
```

### Markdown Display

The `get-item` command can convert HTML rich-text fields to readable markdown. Resolution order:

1. `--markdown` flag enables markdown for the current call
2. Config setting: `azdo config set markdown true`
3. Default: off (HTML stripped to plain text)

### Markdown Field Commands

```bash
# Read field and auto-convert HTML -> markdown
azdo get-md-field 12345 System.Description

# Set markdown inline
azdo set-md-field 12345 System.Description "# Title\n\nSome **bold** text"

# Set markdown from file
azdo set-md-field 12345 System.Description --file ./description.md

# Set markdown from stdin
cat description.md | azdo set-md-field 12345 System.Description
```

### Pull Request Commands

The `pr` command group uses the current git branch and the Azure DevOps `origin` remote automatically. It requires a PAT with `Code (Read)` scope for read operations and `Code (Read & Write)` for pull request creation.

```bash
# Check whether the current branch already has pull requests
azdo pr status

# Open a pull request to develop
azdo pr open --title "Add PR handling" --description "Implements pr status, pr open, pr comments commands"

# Review active comments for the current branch's active pull request
azdo pr comments
```

`azdo pr status`

- Lists pull requests for the current branch
- Prints `No pull requests found for branch <branch>.` when no PRs exist
- Supports `--json` for machine-readable output

`azdo pr open`

- Requires both `--title <title>` and `--description <description>`
- Targets `develop` automatically
- Creates a new active pull request when none exists
- Reuses the existing active PR when one already matches the branch and target
- Fails with a clear error when run from `develop` or when multiple active PRs already exist

`azdo pr comments`

- Resolves the single active pull request for the current branch
- Returns only active or pending threads with visible, non-deleted comments
- Groups text output by thread and shows file context when available
- Prints `Pull request #<id> has no active comments.` when the PR has no active comment threads
- Fails instead of guessing when no active PR or multiple active PRs exist

## azdo upsert

`azdo upsert` accepts a single markdown task document and either creates a new Azure DevOps Task or updates an existing one. Omit `[id]` to create; pass `[id]` to update that work item in place.

```bash
# Create from inline content
azdo upsert --content $'---\nTitle: Improve markdown import UX\nAssigned To: user@example.com\nState: New\n---'

# Update from a file
azdo upsert 12345 --file ./task-import.md

# JSON output
azdo upsert 12345 --content $'---\nSystem.Title: Improve markdown import UX\n---' --json
```

The command requires exactly one source flag:

- `azdo upsert [id] --content <markdown>`
- `azdo upsert [id] --file <path>`

If `--file` succeeds, the source file is deleted after the Azure DevOps write completes. If parsing, validation, or the API call fails, the file is preserved. If deletion fails after a successful write, the command still succeeds and prints a warning.

### Task Document Format

The document starts with YAML front matter for scalar fields, followed by optional `##` heading sections for markdown rich-text fields.

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
- Deletes imported files only after success
```

Supported friendly field names:

- `Title`
- `Assigned To` / `assignedTo`
- `State`
- `Description`
- `Acceptance Criteria` / `acceptanceCriteria`
- `Tags`
- `Priority`

Raw Azure DevOps reference names are also accepted anywhere a field name is expected, for example `System.Title` or `Microsoft.VSTS.Common.AcceptanceCriteria`.

Clear semantics:

- Scalar YAML fields with `null` or an empty value are treated as clears on update.
- Rich-text heading sections with an empty body are treated as clears on update.
- Omitted fields are untouched on update.

`--json` output shape:

```json
{
  "action": "created",
  "id": 12345,
  "fields": {
    "System.Title": "Improve markdown import UX",
    "System.Description": "Implement a single-command task import flow."
  }
}
```

### Configuration

```bash
# List settings
azdo config list

# Interactive setup
azdo config wizard

# Enable markdown display for all get-item calls
azdo config set markdown true

# Set/get/unset values
azdo config set fields "System.Tags,Custom.Priority"
azdo config get fields
azdo config unset fields

# JSON output
azdo config list --json
```

### Credential Management

```bash
# Remove stored PAT from keyring
azdo clear-pat
```

## JSON Output

These commands support `--json` for machine-readable output:
- `list-fields`
- `set-state`
- `assign`
- `set-field`
- `set-md-field`
- `upsert`
- `pr status|open|comments`
- `config set|get|list|unset`

## Development

### Prerequisites

- Node.js LTS (20+)
- npm

### Setup

```bash
git clone https://github.com/alkampfergit/azdo-cli.git
cd azdo-cli
npm install
```

### Scripts

| Command | Description |
| --- | --- |
| `npm run build` | Build the CLI with tsup |
| `npm test` | Build and run tests with vitest |
| `npm run lint` | Lint source files with ESLint |
| `npm run typecheck` | Type-check with tsc (no emit) |
| `npm run format` | Check formatting with Prettier |

## License

[MIT](LICENSE)
