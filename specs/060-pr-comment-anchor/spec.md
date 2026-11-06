# Feature Specification: anchor new pull request threads to a file and line

**Feature Branch**: `feature/060-pr-comment-anchor`
**Status**: Approved (issue #161, owner: "implement"; batch mode split out as a follow-up)

## Problem
`azdo pr comment-add` / `azdo pr comments add` only create overview threads. Code-review tools produce `file:line` findings that should appear next to the code in the Files tab and follow the line across pushes.

## Requirements
- **FR-1**: New options `--file-path <path>`, `--line <n>`, `--end-line <n>` (default `--line`), `--side right|left` (default `right`), `--allow-unchanged-file`, on both the nested command and the alias.
- **FR-2**: The path is normalised: backslashes become `/`, a leading `./` is dropped, one leading `/` is added.
- **FR-3**: `threadContext` fills `rightFileStart`/`rightFileEnd` (or the `left*` pair) with `offset: 1` at the start and a large end offset (1000) so the whole last line is highlighted.
- **FR-4**: `pullRequestThreadContext.iterationContext` is `{ firstComparingIteration: <latest>, secondComparingIteration: <latest> }` (left side = common-commit base); `changeTrackingId` comes from the latest iteration's changes, matched on `item.path` (for `--side left`, a rename's `originalPath` first, then `item.path`). Changes are paged by following `nextSkip` until it is 0.
- **FR-5**: A path the pull request does not change fails with exit 3 before posting, unless `--allow-unchanged-file` is set; then the thread is posted without `changeTrackingId` and a `Note:` on stderr says it will not follow the line across pushes (dry run and real post).
- **FR-6**: `--file-path` and `--line` are required together; `--end-line`/`--side`/`--allow-unchanged-file` without `--file-path`, a non-positive line, `--end-line < --line`, an invalid side, or an empty path fail with exit 1 before any network call.
- **FR-7**: `--dry-run` prints path, line range, side, iteration and `changeTrackingId`; `--json` adds `threadContext`, `pullRequestThreadContext` and `changeTracked`.
- **FR-8**: Without `--file-path` the request, output and JSON shape are unchanged.
- **FR-9**: Documented in `docs/commands.md` and the changelog; README unchanged.

## REST
- `GET .../pullRequests/{id}/iterations?api-version=7.1`
- `GET .../pullRequests/{id}/iterations/{iterationId}/changes?$top=2000&$skip=<nextSkip>&api-version=7.1`
- `POST .../pullRequests/{id}/threads?api-version=7.1` with `threadContext` and `pullRequestThreadContext`

## Out of scope
`--batch findings.json` (follow-up issue). Fetching the file to compute the exact end-of-line offset.
