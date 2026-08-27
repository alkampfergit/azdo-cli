# CLI Command Contract

Two new top-level commands, registered in `src/index.ts` alongside the existing `download-attachment`, following the same flat (non-subcommand) surface.

## `azdo add-attachment <id> <file>`

```
azdo add-attachment <id> <file> [--comment <text>] [--org <org>] [--project <project>]
```

- `<id>`: work item ID (positive integer).
- `<file>`: path to a local file to upload.
- `--comment <text>`: optional comment stored with the attachment.
- `--org <org>`, `--project <project>`: same pairing rule as every other `azdo` command.

**stdout (success)**:
```
Attached "<filename>" (<size>) to work item <id> [id: <attachment-guid>]
```

**stderr + exit 1 (failure)**: local file missing/not-a-file, work item not found, permission denied, or server rejection (size/count limit) — via the existing `handleCommandError` mapping.

## `azdo delete-attachment <id> <filename>`

```
azdo delete-attachment <id> <filename> [--id <attachment-guid>] [--yes|-y] [--org <org>] [--project <project>]
```

- `<id>`: work item ID.
- `<filename>`: attachment name to remove.
- `--id <attachment-guid>`: disambiguates when multiple attachments share `<filename>`. Required in that case even with `--yes`.
- `--yes` / `-y`: skip the interactive `[y/N]` confirmation.

**stdout (success)**:
```
Removed "<filename>" (id: <attachment-guid>) from work item <id>
```

**stdout (ambiguous, no `--id`)** — exit 1, no change made:
```
Error: multiple attachments named "<filename>" on work item <id>:
  <guid-1>  <size-1>  <uploaded-date-1>
  <guid-2>  <size-2>  <uploaded-date-2>
Re-run with --id <guid> to remove a specific one.
```

**stdout (not found)** — exit 1: `Error: Attachment "<filename>" not found on work item <id>.`
