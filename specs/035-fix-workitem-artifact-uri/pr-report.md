# PR Report: Fix malformed work item ArtifactLink URI

**Branch**: `035-fix-workitem-artifact-uri`
**Date**: 2026-08-26
**Spec**: [specs/035-fix-workitem-artifact-uri/spec.md](../035-fix-workitem-artifact-uri/spec.md)

## Summary

`azdo pr work-items link` was writing an Azure DevOps `ArtifactLink` relation whose URI joined
the project id, repository id, and PR id with literal `/` characters instead of the
percent-encoded `%2F` form Azure DevOps' own UI expects — so the CLI reported success, but the
work item never actually appeared in the pull request's "Work Items" panel. This PR fixes the
URI construction so linked work items are visible where the command promises they'll be.

## What's New

- **`src/services/pr-client.ts`**: `buildWorkItemArtifactUri` now percent-encodes the project id
  and repository id segments and joins all three segments with the literal `%2F`, matching Azure
  DevOps' canonical artifact URI encoding. `linkWorkItemToPullRequest`'s "already linked" check
  and `unlinkWorkItemFromPullRequest`'s matching lookup both use this same corrected builder, so
  link/unlink/noop semantics stay mutually consistent.

## Testing

- **Unit**: `tests/unit/pr-client.test.ts` — updated the `linkWorkItemToPullRequest` /
  `unlinkWorkItemFromPullRequest` describe block's `artifactUri` fixture to the corrected
  `%2F`-encoded form, and added a dedicated assertion that the URI is built by percent-encoding
  each segment individually (not just substring-matching `%2F`). All existing FR-numbered tests
  (FR-001, FR-002, FR-004, FR-005) continue to pass against the corrected URI.
- **Manual (deferred to owner)**: `quickstart.md` steps 2, 4, and 6 (linking a real work item to
  a real PR and confirming it renders in the Azure DevOps web UI) require a live ADO org/project
  and were not run in this environment; the JSON `url` shape (step 3) and repeat-call `noop: true`
  behavior (step 5) are covered by the automated unit tests above.

## Notes

- Migrating or cleaning up work items that already carry the old, malformed URI on real Azure
  DevOps instances is out of scope for this fix (confirmed with the issue owner) — those relations
  need a manual unlink/relink after this fix ships, as called out in the original issue.
