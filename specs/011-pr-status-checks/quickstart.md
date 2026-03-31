# Quickstart: Pull Request Status Checks

## Prerequisites

- Configure Azure DevOps authentication with the existing PAT flow.
- Run the command from a git checkout whose `origin` remote points to Azure DevOps.

## Review pull request checks

```bash
azdo pr status
```

Expected result:

- The CLI prints each pull request for the current branch.
- Under each pull request, the CLI prints returned Azure DevOps status checks and their states.
- If a pull request has no returned checks, the CLI says so for that pull request.

## Review pull request checks as JSON

```bash
azdo pr status --json
```

Expected result:

- The CLI prints the existing JSON result shape.
- Each pull request object now includes a `checks` array.

## Review failed check details

```bash
azdo pr status
```

Expected result:

- Checks in `failed` or `error` state include Azure DevOps description text when available.

## No pull requests case

```bash
azdo pr status
```

Expected result:

- If the current branch has no pull requests, the CLI still prints `No pull requests found for branch <branch>.`
