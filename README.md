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
- Download images embedded in rich-text fields, optionally resized for LLM use (`get-item`/`get-md-field` `--download-images`, `--resize-images`)
- Check branch pull request status, open PRs to `develop`, list PR comment threads for any PR (`--pr-number`), and resolve/reopen threads from the CLI (`pr`)
- Persist org/project/default fields in local config (`config`)
- List all fields of a work item (`list-fields`)
- Authenticate per Azure DevOps organization with `azdo auth login` — OAuth (Microsoft Entra) by default, or a Personal Access Token via `--use-pat` (or the `AZDO_PAT` env var). Credentials are stored in the OS credential store. Inspect with `azdo auth status`, remove with `azdo auth logout`. See [docs/authentication.md](docs/authentication.md).

## Installation

```bash
npm install -g azdo-cli
```

## Quick Start

```bash
# Sign in to an organization (OAuth by default; add --use-pat for a PAT)
azdo auth login --org myorg

# Configure defaults once
azdo config set org myorg
azdo config set project myproject

# Read a work item
azdo get-item 12345

# Download images embedded in a work item's rich-text fields (opt-in)
azdo get-item 12345 --download-images                       # saved to the system temp dir
azdo get-item 12345 --resize-images 1024 --images-path ./img # cap width at 1024px, save as PNG
azdo get-md-field 12345 System.Description --download-images # same flags on get-md-field

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
azdo pr comments --pr-number 64 --hide-resolved      # or --exclude-resolved (alias)
azdo pr comments --code-related-only    # only file/line-anchored threads
azdo pr status                          # PR checks (status + branch policies + pipeline builds) + code-comment counts
azdo pr comment-resolve 17 --pr-number 64   # idempotent: exit 0 even when already resolved
azdo pr comment-reopen 17  --pr-number 64

# Pipelines — list, inspect runs, wait (exit code = result), start
azdo pipeline list --filter ci
azdo pipeline get-runs 12 --branch develop --limit 1
azdo pipeline wait 3456                     # blocks; exit 0 success / non-zero failure / 124 timeout
azdo pipeline get-run-detail 3456           # errors, failing tests, per-stage status
azdo pipeline start 12 --branch develop --parameter env=staging
```

## Documentation

| Topic | File |
|-------|------|
| Authentication (OAuth & PAT) | [docs/authentication.md](docs/authentication.md) |
| Linux credential store setup | [docs/linux-credential-store.md](docs/linux-credential-store.md) |
| Full command reference | [docs/commands.md](docs/commands.md) |
| Development setup | [docs/development.md](docs/development.md) |

## License

[MIT](LICENSE)
