# Unreleased

## Added

- `azdo delete-item <id>` deletes a work item. It goes to the Recycle Bin by default; `--permanent` destroys it. It asks for confirmation on a TTY, `--yes` skips the prompt (required in non-interactive shells), and `--json` prints the result. See [Delete a work item](../commands.md#delete-a-work-item).
