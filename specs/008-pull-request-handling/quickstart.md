# Quickstart: Pull Request Handling

**Feature**: 008-pull-request-handling

## Prerequisites

- `azdo` is installed and authenticated with a PAT that has at minimum `Code (Read)` scope.
- For `pr open`, the PAT requires `Code (Read & Write)` scope.
- The current directory is a git checkout whose `origin` remote points at the Azure DevOps repository.
- Organization and project resolve through `azdo config`, `--org`/`--project` flags, or Azure DevOps remote detection.

## Typical Flow

### 1. Check whether the current branch already has pull requests

```bash
azdo pr status
```

Expected outcomes:
- Prints a clear no-results message when the current branch has no pull requests.
- Lists each pull request with its ID, status, target branch, title, and URL.
- Use `--json` for script-friendly output.

### 2. Open a pull request to `develop`

```bash
azdo pr open --title "Add PR handling" --description "Implements pr status, pr open, pr comments commands"
```

Expected outcomes:
- Creates a new active pull request from the current branch to `develop` when none exists.
- Reuses the existing active pull request when one already targets `develop` (idempotent).
- Fails with an actionable error when run from the `develop` branch.
- Both `--title` and `--description` are required; the command fails if either is missing.

### 3. Review active pull request comments

```bash
azdo pr comments
```

Expected outcomes:
- Resolves the single active pull request for the current branch.
- Returns only active/pending threads with visible, non-deleted comments.
- Groups output by thread with thread context (file path if available) as a header.
- Prints a clear empty-result message when the pull request has no active comments.
- Fails instead of guessing when multiple active pull requests exist for the branch.

## Script-Friendly Examples

```bash
# Machine-readable output for all three commands
azdo pr status --json
azdo pr open --title "My title" --description "My description" --json
azdo pr comments --json
```

## Implementation Steps

1. Extend `src/services/git-remote.ts` with `parseRepoName()` and `detectRepoName()` (pure + effectful pair).
2. Add `getCurrentBranch()` to `src/services/git-remote.ts` using `git rev-parse --abbrev-ref HEAD`.
3. Add `src/types/pull-request.ts` with all exported interfaces.
4. Add `src/services/pr-client.ts` with `listPullRequests()`, `openPullRequest()`, and `getPullRequestThreads()`.
5. Add `src/commands/pr.ts` — parent `pr` command with `status`, `open`, `comments` subcommands.
6. Register `createPrCommand()` in `src/index.ts`.
7. Add unit tests covering: git helpers, pr-client API calls, all three subcommands (success + error paths), thread filtering, and JSON output.

## Key Implementation Notes

- `pr status` is read-only; zero matches is a success (exit 0), not an error.
- `pr open` is idempotent for the current branch to `develop`.
- `pr comments` is strict about ambiguity: exactly one active PR must be resolvable; fails otherwise.
- Thread output is grouped: thread header (ID, status, file path if available), then indented comments.
- All commands share `--org`, `--project`, and `--json` options via the parent `pr` command or individually.
