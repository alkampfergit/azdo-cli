# CLI Contract: download-attachment

## Command Signature

```
azdo download-attachment <id> <filename> [options]
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| id | Yes | Work item ID (positive integer) |
| filename | Yes | Name of the attachment to download |

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| --org | string | from config/git | Azure DevOps organization |
| --project | string | from config/git | Azure DevOps project |
| --output | string | current directory | Target directory for the downloaded file |

## Output

### Success (exit code 0)

```
Downloaded "design.png" (102.4 KB) to ./design.png
```

### Errors (exit code 1)

| Scenario | stderr message |
|----------|---------------|
| Attachment not found | `Error: Attachment "foo.txt" not found on work item 42.` |
| Work item not found | `Error: Work item 42 not found in org/project.` |
| Auth failed | `Error: Authentication failed. Check that your PAT is valid...` |
| Network error | `Error: Could not connect to Azure DevOps...` |
| Output dir missing | `Error: Output directory "/bad/path" does not exist.` |

## get-item Attachment Display

### Full output (no --short)

```
Attachments:
  design.png (102.4 KB)
  requirements.docx (45.2 KB)
```

### Short output (--short)

```
Attachments: 2
```
