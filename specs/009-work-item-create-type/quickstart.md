# Quickstart: Work Item Create by Type

**Feature**: 009-work-item-create-type

## Prerequisites

- `azdo` installed and authenticated with a PAT that can write Azure DevOps work items
- Organization and project resolved via config, flags, or Azure DevOps git remote detection

## Create Examples

```bash
# Create a Bug
azdo upsert --type Bug --content $'---\nTitle: Fix flaky login\nState: New\n---'

# Create a User Story
azdo upsert --type "User Story" --content $'---\nTitle: Improve markdown import UX\n---\n\n## Description\n\nAs a user, I want create-by-type support.'

# Preserve the existing Task default
azdo upsert --content $'---\nTitle: Follow-up task\n---'
```

## Update Example

```bash
azdo upsert 12345 --content $'---\nSystem.Title: Refine acceptance criteria\n---'
```

## Rules

- `--type` is optional for create and defaults to `Task`.
- `--type` is invalid for update calls that include an ID.
- File-based create requests keep the existing success-only file deletion behavior.
- Human-readable and JSON success output identify the resulting work item type.
