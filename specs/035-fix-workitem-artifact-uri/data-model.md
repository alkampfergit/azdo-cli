# Data Model: Fix malformed work item ArtifactLink URI

No new entities or persisted local data are introduced. This fix changes how a single existing
string value is constructed.

## ArtifactLink relation (existing Azure DevOps concept, not owned by this CLI)

| Field | Type | Notes |
| --- | --- | --- |
| `rel` | string | Always `"ArtifactLink"` for this relation kind. Unchanged by this fix. |
| `url` | string | The vstfs artifact URI. **Changes**: was `vstfs:///Git/PullRequestId/<projectId>/<repositoryId>/<prId>`, becomes `vstfs:///Git/PullRequestId/<encoded projectId>%2F<encoded repositoryId>%2F<prId>`. |
| `attributes.name` | string | `"Pull Request"`. Unchanged. |

## Affected function signatures (no signature changes, only return value content)

- `buildWorkItemArtifactUri(projectId: string, repositoryId: string, prId: number): string` —
  internal helper in `src/services/pr-client.ts`; return value format changes, signature does not.
- `linkWorkItemToPullRequest(...)` / `unlinkWorkItemFromPullRequest(...)` — call
  `buildWorkItemArtifactUri` and compare against it; no signature change, the `url` field in
  their returned result objects now reflects the corrected URI.
