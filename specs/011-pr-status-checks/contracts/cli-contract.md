# CLI Contract: Pull Request Status Checks

**Date**: 2026-03-31
**Feature**: 011-pr-status-checks

## `azdo pr status`

### Synopsis

```bash
azdo pr status [options]
```

### Options

| Option | Description |
| ------ | ----------- |
| `--org <org>` | Azure DevOps organization override |
| `--project <project>` | Azure DevOps project override |
| `--json` | Output structured JSON |

### Behavior

1. Resolve org/project, repository, branch, and PAT using the existing `pr` command flow.
2. Retrieve pull requests for the current branch.
3. For each returned pull request, retrieve Azure DevOps pull request status checks.
4. Filter out `notApplicable` and `notSet` checks.
5. Print text output with nested checks or JSON output with a `checks` array on each pull request.

### Human-Readable Success Output

```text
#12 [active] Test PR
feature/test -> develop
https://example.test/pr/12
Checks:
- [succeeded] ci/build
- [pending] security/sca
- [failed] quality/unit-tests
  Detail: Test run 144 failed in stage unit
```

Empty checks for a pull request:

```text
#12 [active] Test PR
feature/test -> develop
https://example.test/pr/12
Checks: none reported by Azure DevOps
```

### JSON Success Output

```json
{
  "branch": "feature/test",
  "repository": "repo-name",
  "pullRequests": [
    {
      "id": 12,
      "title": "Test PR",
      "repository": "repo-name",
      "sourceRefName": "refs/heads/feature/test",
      "targetRefName": "refs/heads/develop",
      "status": "active",
      "createdBy": "Alice",
      "url": "https://example.test/pr/12",
      "checks": [
        {
          "id": 44,
          "state": "failed",
          "name": "quality/unit-tests",
          "description": "Test run 144 failed in stage unit",
          "targetUrl": "https://example.test/build/144",
          "createdBy": "Azure Pipelines",
          "createdAt": "2026-03-31T10:00:00Z",
          "updatedAt": "2026-03-31T10:02:00Z"
        }
      ]
    }
  ]
}
```

### Error Messages

| Condition | stderr message |
| --------- | -------------- |
| Auth failure | `Error: Authentication failed. Check that your PAT is valid and has the "Code (Read)" scope.` |
| Azure DevOps request failure | `Error: Azure DevOps request failed with HTTP_<code>.` |
| Detached HEAD | `Error: Not on a named branch. Check out a named branch and try again.` |
