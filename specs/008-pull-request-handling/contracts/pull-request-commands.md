# CLI Contract: Pull Request Commands

## Command Group

`azdo pr`

This feature adds a pull request command group with JSON and human-readable output, matching the repository's existing CLI conventions.

## `azdo pr status`

- **Purpose**: List pull requests associated with the current branch.
- **Arguments**: none
- **Options**:
  - `--json`
  - `--org <org>`
  - `--project <project>`
- **Behavior**:
  - Resolves current branch from local Git state
  - Resolves repository from the `origin` remote
  - Returns all matching PRs for that source branch, including status
- **Human output contract**:
  - No matches: a single clear line stating that the current branch has no pull requests
  - Matches: one entry per PR including PR id, status, target branch, title, and URL
- **JSON output contract**:

```json
{
  "branch": "008-pull-request-handling",
  "repository": "azdo-cli",
  "pullRequests": [
    {
      "id": 42,
      "status": "active",
      "title": "Add PR handling",
      "repository": "azdo-cli",
      "sourceRefName": "refs/heads/008-pull-request-handling",
      "targetRefName": "refs/heads/develop",
      "createdBy": "alice@example.com",
      "url": "https://dev.azure.com/org/project/_git/repo/pullrequest/42"
    }
  ]
}
```

## `azdo pr open`

- **Purpose**: Open a pull request from the current branch to `develop`, or return the existing active PR if one already exists.
- **Arguments**: none
- **Options** (both required):
  - `--title <title>` (**required**)
  - `--description <description>` (**required**)
  - `--json`
  - `--org <org>`
  - `--project <project>`
- **Behavior**:
  - Resolves current branch and repository from local Git state
  - Rejects execution when current branch is `develop`
  - Fails if `--title` or `--description` is missing
  - Checks for an existing active PR from the branch to `develop`
  - Creates a new PR only when no active duplicate exists
- **Human output contract**:
  - Created: one line indicating PR id, title, and web link
  - Existing: one line indicating the existing active PR id and web link
- **JSON output contract**:

```json
{
  "branch": "008-pull-request-handling",
  "targetBranch": "develop",
  "created": true,
  "pullRequest": {
    "id": 42,
    "status": "active",
    "title": "Add PR handling",
    "repository": "azdo-cli",
    "sourceRefName": "refs/heads/008-pull-request-handling",
    "targetRefName": "refs/heads/develop",
    "createdBy": "alice@example.com",
    "url": "https://dev.azure.com/org/project/_git/repo/pullrequest/42"
  }
}
```

## `azdo pr comments`

- **Purpose**: Return active, non-closed discussion for the relevant active pull request of the current branch.
- **Arguments**: none
- **Options**:
  - `--json`
  - `--org <org>`
  - `--project <project>`
- **Behavior**:
  - Resolves the current branch and repository from local Git state
  - Selects the single active PR for the branch
  - Fails with an ambiguity error when multiple active PRs exist
  - Fetches threads and returns only `active` or `pending` threads with visible, non-deleted comments
  - Output is grouped by thread: thread header (ID, status, file path if available) then indented comments
- **Human output contract**:
  - Empty result: a single clear line stating there are no active comments
  - Matches: thread-grouped output showing thread id, optional file path, and comments
- **JSON output contract**:

```json
{
  "branch": "008-pull-request-handling",
  "pullRequest": {
    "id": 42,
    "status": "active",
    "title": "Add PR handling"
  },
  "threads": [
    {
      "id": 7,
      "status": "active",
      "threadContext": "src/index.ts",
      "comments": [
        {
          "id": 1,
          "author": "Reviewer Name",
          "content": "Please handle the error case.",
          "publishedAt": "2026-03-26T10:00:00Z"
        }
      ]
    }
  ]
}
```

## Error Contract

- Authentication failures must produce a non-zero exit code and an actionable PAT scope message.
- Permission failures must produce a non-zero exit code and mention the project context.
- Missing or detached branch state must produce a non-zero exit code and explain that a checked out branch is required.
- Multiple active PRs for `azdo pr comments` must produce a non-zero exit code and list enough information for the user to disambiguate manually.
- `azdo pr status` may return zero matches without treating that outcome as an execution error.
- Missing `--title` or `--description` for `azdo pr open` must produce a non-zero exit code with an actionable message.
