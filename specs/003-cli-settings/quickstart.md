# Quickstart: CLI Settings

## Prerequisites

- azdo-cli installed (`npm install -g azdo-cli`)
- An Azure DevOps PAT configured (via `AZDO_PAT` env var or interactive login)

## Set Default Organization and Project

```bash
# Save your default org and project
azdo config set org myorganization
azdo config set project myproject

# Now get-item works without --org/--project flags (even outside a git repo)
azdo get-item 12345
```

## Configure Additional Fields

```bash
# Add extra fields to always display with get-item
azdo config set fields "System.Tags,Microsoft.VSTS.Common.Priority"

# get-item now shows Tags and Priority alongside default fields
azdo get-item 12345

# Override saved fields for a single invocation
azdo get-item 12345 --fields "System.Tags,Microsoft.VSTS.Scheduling.StoryPoints"
```

## View and Manage Settings

```bash
# List all saved settings
azdo config list

# View a specific setting
azdo config get org

# Remove a setting
azdo config unset fields

# JSON output
azdo config list --json
```

## Precedence

When resolving org/project:
1. Explicit `--org`/`--project` flags (highest priority)
2. Git remote auto-detection (if in Azure DevOps repo)
3. Saved defaults from `azdo config set` (lowest priority)

This means you can set global defaults but still override per-repo via git remote or per-command via flags.
