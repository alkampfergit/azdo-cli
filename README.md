# azdo-cli

Azure DevOps CLI focused on work item read/write workflows.

[![npm version](https://img.shields.io/npm/v/azdo-cli)](https://www.npmjs.com/package/azdo-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=alkampfergit_azdo-cli&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=alkampfergit_azdo-cli)

## Features

- Retrieve work items with readable output (`get-item`)
- Update work item state, assignee, or any field (`set-state`, `assign`, `set-field`)
- Create or update work items from markdown documents (`upsert`)
- Read and post work item comments (`comments`)
- Read/write rich-text fields as markdown (`get-md-field`, `set-md-field`)
- Check branch pull request status, open PRs to `develop`, list PR comment threads for any PR (`--pr-number`), and resolve/reopen threads from the CLI (`pr`)
- Persist org/project/default fields in local config (`config`)
- List all fields of a work item (`list-fields`)
- Store a PAT per Azure DevOps organization in the OS credential store via `azdo auth` (or use `AZDO_PAT`). Inspect with `azdo auth status`, remove with `azdo auth logout`. See [docs/authentication.md](docs/authentication.md).

## Installation

```bash
npm install -g azdo-cli
```

## Quick Start

```bash
# Configure defaults once
azdo config set org myorg
azdo config set project myproject

# Read a work item
azdo get-item 12345

# Update state
azdo set-state 12345 "Active"

# Create a work item from markdown
azdo upsert --type "User Story" --content $'---\nTitle: Improve markdown import UX\nState: New\n---'

# Read and post work item comments
azdo comments list 12345
azdo comments add 12345 "Investigating the root cause now."

# PR comment threads — list, filter, target by number, resolve or reopen
azdo pr comments                        # active-branch PR
azdo pr comments --pr-number 64         # any PR by number (skips branch lookup)
azdo pr comments --pr-number 64 --hide-resolved
azdo pr comment-resolve 17 --pr-number 64   # idempotent: exit 0 even when already resolved
azdo pr comment-reopen 17  --pr-number 64
```

## Documentation

| Topic | File |
|-------|------|
| Authentication & PAT storage | [docs/authentication.md](docs/authentication.md) |
| Linux credential store setup | [docs/linux-credential-store.md](docs/linux-credential-store.md) |
| Full command reference | [docs/commands.md](docs/commands.md) |
| Development setup | [docs/development.md](docs/development.md) |

## License

[MIT](LICENSE)
