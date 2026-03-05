# CLI Contract: get-item

**Feature**: 002-get-item-command | **Date**: 2026-03-05

## Command Signature

```
azdo get-item <id> [options]
```

## Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | positive integer | Yes | Azure DevOps work item ID |

## Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `--org <org>` | string | No* | auto-detect from git remote | Azure DevOps organization name |
| `--project <project>` | string | No* | auto-detect from git remote | Azure DevOps team project name |
| `--short` | boolean | No | false | Truncate description to 3-5 lines and show only core fields |

*`--org` and `--project` must be both provided or both omitted.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AZDO_PAT` | No | Personal Access Token for authentication. If not set, the CLI checks Windows Credential Manager, then prompts interactively. |

## PAT Resolution Order

1. `AZDO_PAT` environment variable
2. Windows Credential Manager (service: `azdo-cli`, account: `pat`)
3. Interactive prompt (masked input, result persisted to credential manager)

## Output (stdout)

### Default Output (human-readable)

```
ID:          12345
Type:        User Story
Title:       Implement user authentication
State:       Active
Assigned To: Jane Doe
Area:        MyProject\Backend
Iteration:   MyProject\Sprint 5
URL:         https://dev.azure.com/org/project/_workitems/edit/12345

Description:
As a user, I want to be able to log in so that I can access my account.

Acceptance Criteria:
- User can log in with email and password
- User sees error message on invalid credentials
```

### Short Output (`--short`)

```
ID:          12345
Type:        User Story
Title:       Implement user authentication
State:       Active
Assigned To: Jane Doe
URL:         https://dev.azure.com/org/project/_workitems/edit/12345

Description: As a user, I want to be able to log in so that I can access...
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success - work item displayed |
| 1 | Error - authentication failure, not found, validation error, network error |

## Error Output (stderr)

All errors are written to stderr with actionable messages:

| Scenario | Message Pattern |
|----------|----------------|
| Invalid ID | `Error: Work item ID must be a positive integer. Got: "{input}"` |
| Missing org/project pair | `Error: --org and --project must both be provided, or both omitted.` |
| Non-Azure remote | `Error: Git remote "origin" is not an Azure DevOps URL. Provide --org and --project explicitly.` |
| No git repo, no flags | `Error: Not in a git repository. Provide --org and --project explicitly.` |
| Auth failure (401) | `Error: Authentication failed. Check that your PAT is valid and has the "Work Items (read)" scope.` |
| Not found (404) | `Error: Work item {id} not found in {org}/{project}.` |
| Permission denied (403) | `Error: Access denied. Your PAT may lack permissions for project "{project}".` |
| Network error | `Error: Could not connect to Azure DevOps. Check your network connection.` |
| Prompt cancelled | `Error: Authentication cancelled. Set AZDO_PAT environment variable or run again to enter a PAT.` |
