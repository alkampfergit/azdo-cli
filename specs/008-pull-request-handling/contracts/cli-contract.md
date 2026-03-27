# CLI Contract: Pull Request Handling

**Date**: 2026-03-27
**Feature**: 008-pull-request-handling

## Command Group

```bash
azdo pr <subcommand> [options]
```

Shared options on all subcommands:

| Option | Description |
|--------|-------------|
| `--org <org>` | Azure DevOps organization override |
| `--project <project>` | Azure DevOps project override |
| `--json` | Output machine-readable JSON to stdout |

Repository and branch are resolved from the current git checkout and Azure DevOps `origin` remote.

---

## `azdo pr status`

### Synopsis

```bash
azdo pr status [--org <org>] [--project <project>] [--json]
```

### Behavior

1. Resolve org/project from flags → config → git remote.
2. Resolve repository name from the Azure DevOps `origin` remote.
3. Resolve the current local branch name from `git rev-parse --abbrev-ref HEAD`.
4. Query all pull requests whose `sourceRefName` matches the current branch.
5. Return all matching pull requests and their states.

### Success Output

Human-readable (matches found):
```
Branch 008-pull-request-handling has 2 pull requests
#42  active     008-pull-request-handling -> develop  Add PR handling
     https://dev.azure.com/org/project/_git/repo/pullrequest/42
#30  completed  008-pull-request-handling -> develop  Add PR handling (old)
     https://dev.azure.com/org/project/_git/repo/pullrequest/30
```

Human-readable (no matches):
```
No pull requests found for branch 008-pull-request-handling.
```

JSON:
```json
{
  "branch": "008-pull-request-handling",
  "repository": "azdo-cli",
  "pullRequests": [
    {
      "id": 42,
      "title": "Add PR handling",
      "repository": "azdo-cli",
      "sourceRefName": "refs/heads/008-pull-request-handling",
      "targetRefName": "refs/heads/develop",
      "status": "active",
      "createdBy": "alice@example.com",
      "url": "https://dev.azure.com/org/project/_git/repo/pullrequest/42"
    }
  ]
}
```

---

## `azdo pr open`

### Synopsis

```bash
azdo pr open --title <title> --description <description> [--org <org>] [--project <project>] [--json]
```

Both `--title` and `--description` are **required**.

### Behavior

1. Resolve org/project, repository, and current branch.
2. Fail if current branch is `develop`.
3. Fail if `--title` or `--description` is missing.
4. Query active PRs from current branch to `develop`.
5. One active match → return it with `created: false` (no duplicate created).
6. Multiple active matches → fail with ambiguity error.
7. Zero active matches → create PR using provided title and description; return with `created: true`.

### Success Output

Human-readable (created):
```
Created pull request #42: Add PR handling
https://dev.azure.com/org/project/_git/repo/pullrequest/42
```

Human-readable (reused):
```
Active pull request already exists for 008-pull-request-handling -> develop: #42
https://dev.azure.com/org/project/_git/repo/pullrequest/42
```

JSON:
```json
{
  "branch": "008-pull-request-handling",
  "targetBranch": "develop",
  "created": true,
  "pullRequest": {
    "id": 42,
    "title": "Add PR handling",
    "repository": "azdo-cli",
    "sourceRefName": "refs/heads/008-pull-request-handling",
    "targetRefName": "refs/heads/develop",
    "status": "active",
    "createdBy": "alice@example.com",
    "url": "https://dev.azure.com/org/project/_git/repo/pullrequest/42"
  }
}
```

---

## `azdo pr comments`

### Synopsis

```bash
azdo pr comments [--org <org>] [--project <project>] [--json]
```

### Behavior

1. Resolve org/project, repository, and current branch.
2. Query active PRs for the current branch.
3. Zero active PRs → fail with actionable message.
4. Multiple active PRs → fail with ambiguity message listing PR IDs.
5. One active PR → fetch its threads.
6. Filter: keep only threads with `status === 'active'` or `status === 'pending'` that have at least one non-deleted, non-empty comment.
7. Return grouped thread output; empty thread list is a success.

### Output Format

Human-readable (threads found) — grouped by thread:
```
Active comments for pull request #42: Add PR handling

Thread #7 [active] src/index.ts
  Alice Example: Please split this command registration into a group.
  Bob Example: Agreed, add a JSON example to the README too.

Thread #12 [active] (general)
  Carol Dev: Missing test coverage for error paths.
```

Human-readable (no active comments):
```
Pull request #42 has no active comments.
```

JSON:
```json
{
  "branch": "008-pull-request-handling",
  "pullRequest": {
    "id": 42,
    "title": "Add PR handling",
    "repository": "azdo-cli",
    "sourceRefName": "refs/heads/008-pull-request-handling",
    "targetRefName": "refs/heads/develop",
    "status": "active",
    "createdBy": "alice@example.com",
    "url": "https://dev.azure.com/org/project/_git/repo/pullrequest/42"
  },
  "threads": [
    {
      "id": 7,
      "status": "active",
      "threadContext": "src/index.ts",
      "comments": [
        {
          "id": 1,
          "author": "Alice Example",
          "content": "Please split this command registration into a group.",
          "publishedAt": "2026-03-26T10:00:00Z"
        }
      ]
    }
  ]
}
```

---

## Error Messages

| Condition | stderr |
|-----------|--------|
| Detached HEAD / no branch | `Error: Could not determine the current branch. Check out a named branch and try again.` |
| Non-Azure DevOps remote | `Error: Git remote "origin" is not an Azure DevOps URL. Provide --org and --project explicitly.` |
| Missing org/project | `Error: Could not determine org/project. Use --org and --project flags, work from an Azure DevOps git repo, or run "azdo config set org/project".` |
| Missing `--title` | `Error: --title is required for pull request creation.` |
| Missing `--description` | `Error: --description is required for pull request creation.` |
| Source branch is `develop` | `Error: Pull request creation requires a source branch other than develop.` |
| Target branch not found | `Error: Target branch develop was not found in repository <repo>.` |
| Multiple active PRs on `pr open` | `Error: Multiple active pull requests already exist for branch <branch> targeting develop: #<id1>, #<id2>.` |
| No active PR for `pr comments` | `Error: No active pull request found for branch <branch>.` |
| Multiple active PRs for `pr comments` | `Error: Multiple active pull requests found for branch <branch>: #<id1>, #<id2>. Use pr status to review them.` |
| Auth failure | `Error: Authentication failed. Check that your PAT is valid and has the "Code (Read)" scope.` |
| Permission denied | `Error: Permission denied for pull request operations in project <project>.` |
| API rejection | `Error: Pull request operation rejected: <server message>` |
| Network error | `Error: Could not connect to Azure DevOps. Check your network connection.` |

All errors write to **stderr** and exit with code **1**.
