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
- Read rich-text fields as markdown (`get-md-field`)
- Set rich-text fields as markdown from inline text, file, or stdin (`set-md-field`)
- Persist org/project/default fields in local config (`config`)
- Store PAT in OS credential store (or use `AZDO_PAT`)

## Installation

```bash
npm install -g azdo-cli
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
```

## Command Cheat Sheet

| Command | Purpose | Common Flags |
| --- | --- | --- |
| `azdo get-item <id>` | Read a work item | `--short`, `--fields`, `--markdown`, `--org`, `--project` |
| `azdo set-state <id> <state>` | Change work item state | `--json`, `--org`, `--project` |
| `azdo assign <id> [name]` | Assign or unassign owner | `--unassign`, `--json`, `--org`, `--project` |
| `azdo set-field <id> <field> <value>` | Update any field | `--json`, `--org`, `--project` |
| `azdo get-md-field <id> <field>` | Get field as markdown | `--org`, `--project` |
| `azdo set-md-field <id> <field> [content]` | Set markdown field | `--file`, `--json`, `--org`, `--project` |
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

# Disable markdown even if config is on
azdo get-item 12345 --no-markdown
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

### Markdown Display

The `get-item` command can convert HTML rich-text fields to readable markdown. Resolution order:

1. `--markdown` / `--no-markdown` flag (highest priority)
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
- `set-state`
- `assign`
- `set-field`
- `set-md-field`
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
