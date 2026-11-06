# Unreleased — targeting 0.24.0

> Working detail for the next release. Finalised into
> `docs/changelogs/0.24.0.md` when the release is cut.

- `azdo pr comment-add` / `azdo pr comments add` can anchor a new thread to a file and line range with `--file-path`, `--line`, `--end-line` and `--side right|left`. The thread is placed on the latest iteration with the file's `changeTrackingId`, so it follows the line across later pushes. A path the pull request does not change is rejected (exit 3) unless `--allow-unchanged-file` is given. `--dry-run` shows the resolved anchor and `--json` returns `threadContext` (#161).
