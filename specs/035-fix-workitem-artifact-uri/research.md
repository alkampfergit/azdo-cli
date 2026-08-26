# Phase 0 Research: Fix malformed work item ArtifactLink URI

## Unknown: What is the canonical, ADO-recognized artifact URI format for a `PullRequestId` ArtifactLink relation?

**Decision**: Percent-encode `projectId` and `repositoryId` and join all three segments
(`projectId`, `repositoryId`, `prId`) with the literal string `%2F`, producing:

```
vstfs:///Git/PullRequestId/${encodeURIComponent(projectId)}%2F${encodeURIComponent(repositoryId)}%2F${prId}
```

**Rationale — verified against authoritative sources per Constitution Principle VI**:

- Microsoft Learn's own `GitPullRequest.ArtifactId` property doc gives a *template* with literal
  slashes (`vstfs:///Git/PullRequestId/{projectId}/{repositoryId}/{pullRequestId}`), but this
  describes the read-only `ArtifactId` value the Git REST API returns on a `GitPullRequest`
  object — not the exact string Work Item Tracking's ArtifactLink relation matcher expects when
  you `PATCH` a work item's `/relations/-`.
- The official `microsoft/azure-devops-mcp` server (Microsoft's own reference MCP
  implementation) uses `%2F`-joined artifact URIs for the analogous multi-segment Git artifact
  type it documents in the wild: `vstfs:///Git/Ref/{projectId}%2F{repositoryId}%2FGB{branchName}`
  for branches (GitHub issue microsoft/azure-devops-mcp#279, and its `wit_list_artifact_links`
  response example shows the same `%2F`-encoded shape for a live `ArtifactLink` relation).
- A first-hand report on `MicrosoftDocs/vsts-rest-api-specs#699` (comment from `nietras`)
  describes exactly this repo's symptom: building the relation with literal slashes
  (`vstfs:///Git/PullRequestId/{projectId}/{repositoryId}/{pullRequestId}`) succeeds at the API
  level (the PATCH returns 200, work-item-to-PR direction "works") but the link does not resolve
  correctly in the associated UI — matching issue #84's report that the CLI reports success but
  the PR's "Work Items" panel shows nothing.
- Conclusion: the *documented template string* and the *literal wire format ADO's matcher
  expects* are not the same thing for this relation type. The working, UI-visible format is the
  `%2F`-joined one, which is what the originating GitHub issue's suggested fix already proposed
  from direct reproduction. This code change adopts that fix.

**Alternatives considered**:
- Keep literal `/` separators (status quo): rejected — reproducibly fails to render in the ADO
  web UI per the issue's steps to reproduce; this is the bug being fixed.
- Percent-encode the entire three-segment string as one opaque blob (i.e.
  `encodeURIComponent(`${projectId}/${repositoryId}/${prId}`)`, which would also encode the
  separators as `%2F` but as a side effect of a single `encodeURIComponent` call rather than
  per-segment encoding): rejected in favor of the more explicit per-segment
  `encodeURIComponent(projectId)}%2F${encodeURIComponent(repositoryId)}%2F${prId}` form used by
  the issue's suggested fix and by `azure-devops-mcp`'s branch-ref example — functionally
  equivalent for GUID-shaped ids (which contain no characters `encodeURIComponent` would alter),
  but per-segment encoding is correct if `repositoryId` or `projectId` were ever names rather
  than GUIDs, and it keeps the PR id segment (an integer, never encoded) visually distinct in
  the template literal.

## Unknown: Does this change affect any other artifact link type already in the codebase (e.g., the TFVC `CodeReviewId` artifact link seen in tests)?

**Decision**: No. Only `buildWorkItemArtifactUri` (the `Git/PullRequestId` builder) changes.
The `CodeReviewId` artifact type referenced elsewhere in the test suite (`tests/unit/pr-client.test.ts:917`)
is a distinct, unrelated artifact scheme (`vstfs:///CodeReview/CodeReviewId/{projectId}/{prId}`,
two segments, used for querying policy evaluation records) and is out of scope for this fix.

**Rationale**: Confirmed by reading the existing test file and the current
`buildWorkItemArtifactUri` implementation — no other code path constructs a `Git/PullRequestId`
artifact URI.

**Alternatives considered**: N/A — no other call site exists.

## Unknown: Migration of already-linked work items with the old (malformed) URI

**Decision**: Out of scope for this code change, per the spec's Assumptions section (owner
confirmed via "proceed" on the approved spec). The fix only changes how *new* comparisons and
writes are constructed going forward.

**Rationale**: The issue itself frames this as a known follow-up for affected users
(unlink/relink), not something the CLI needs to auto-migrate. No requirement in the spec asks
for a migration command.

**Alternatives considered**: A one-off `migrate` command to rewrite existing relations — rejected
as scope creep beyond the reported bug; can be filed as a separate issue if needed.
