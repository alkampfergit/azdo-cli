# PR Report: Bulk PR ↔ work item read in `azdo pr list`

**Branch**: `feature/047-pr-list-bulk-fields` | **Date**: 2026-10-01 | **Spec**: [spec.md](./spec.md)

## Summary

Every PR in `--json` now carries `isDraft`, `creationDate`, `closedDate`,
`reviewers` (`uniqueName`, `vote`, `isRequired`) and `labels`, read from the
payload the list call already returns. `azdo pr list --work-items` adds
`workItemIds` per PR, so the PR ↔ work item map is one `azdo` invocation.

## Notes

- **No last-update timestamp**: Azure DevOps' `GitPullRequest` has none.
- `--work-items` makes one `GET .../pullRequests/{id}/workitems` per PR (≤5 in
  flight); the list endpoint never returns `workItemRefs`.
- Additive JSON change on `pr list`, `pr status`, `pr open`, `pr comments`.

## Testing

- Full suite: 1456 passed / 129 skipped; `npm run lint` clean.
