# Azure DevOps API Contracts: 026-fix-pr-build-status

## New API Call — Builds List filtered by PR merge ref

### Endpoint

```
GET https://dev.azure.com/{org}/{project}/_apis/build/builds
    ?branchName=refs/pull/{prId}/merge
    &queryOrder=queueTimeDescending
    &$top=50
    &api-version=7.1
```

**Auth scope**: `vso.build` (implied by existing pipeline commands)

### Request parameters

| Parameter | Value | Notes |
|---|---|---|
| `branchName` | `refs/pull/{prId}/merge` | Targets the PR's synthetic merge ref; all PR-triggered builds use this as `sourceBranch` |
| `queryOrder` | `queueTimeDescending` | Most recent first |
| `$top` | `50` | Covers realistic check counts; bounds response size |
| `api-version` | `7.1` | Consistent with rest of codebase |

### Response shape (relevant fields only)

```jsonc
{
  "count": 1,
  "value": [
    {
      "id": 1234,
      "buildNumber": "20260609.1",
      "status": "completed",          // notStarted | inProgress | completed | cancelling | postponed
      "result": "succeeded",          // succeeded | partiallySucceeded | failed | canceled | none (only when completed)
      "reason": "pullRequest",
      "sourceBranch": "refs/pull/65/merge",
      "queueTime": "2026-06-09T10:00:00Z",
      "finishTime": "2026-06-09T10:05:00Z",
      "definition": {
        "id": 7,
        "name": "CI - Build Validation"
      },
      "_links": {
        "web": {
          "href": "https://dev.azure.com/org/project/_build/results?buildId=1234"
        }
      }
    }
  ]
}
```

---

## Existing API Calls (unchanged)

### PR Statuses API (source: 'status')

```
GET /_apis/git/repositories/{repo}/pullRequests/{prId}/statuses?api-version=7.1
```

No changes.

### Policy Evaluations API (source: 'policy')

```
GET /_apis/policy/evaluations?artifactId=vstfs:///CodeReview/CodeReviewId/{projectId}/{prId}&api-version=7.1-preview.1
```

**Response addition used** (field already exists in the ADO response; just not in our type):

```jsonc
{
  "evaluationId": "...",
  "status": "approved",
  "configuration": {
    "id": 12,
    "isBlocking": true,           // now captured and exposed
    "type": { "displayName": "Build" },
    "settings": { "displayName": "CI - Build Validation" }
  },
  "context": {
    "buildId": 1234               // now captured for deduplication
  }
}
```

### Projects API (for projectId resolution)

```
GET /_apis/projects/{project}?api-version=7.1
```

No changes.
