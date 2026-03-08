# CLI Command Contracts: Markdown Field Commands

**Date**: 2026-03-06
**Feature**: 005-md-field-commands

## `get-md-field`

### Synopsis

```
azdo get-md-field <id> <field> [options]
```

### Arguments

| Argument | Required | Description                                          |
| -------- | -------- | ---------------------------------------------------- |
| `id`     | Yes      | Work item ID (positive integer)                      |
| `field`  | Yes      | Field reference name (e.g., `System.Description`)    |

### Options

| Option              | Description                          |
| ------------------- | ------------------------------------ |
| `--org <org>`       | Azure DevOps organization            |
| `--project <project>` | Azure DevOps project              |

### Output

- **stdout**: Raw markdown text (no JSON envelope, no metadata)
- **stderr**: Error messages
- **Exit code**: 0 on success, 1 on error

### Behavior

1. Resolve org/project context (flags > config > git remote)
2. Authenticate via PAT (env > credential store > prompt)
3. Fetch work item field value via Azure DevOps REST API
4. Detect content format (HTML vs markdown/plain text)
5. If HTML: convert to markdown using `node-html-markdown`
6. Write result to stdout

### Examples

```bash
# Get description as markdown
azdo get-md-field 12345 System.Description

# Get acceptance criteria with explicit org/project
azdo get-md-field 12345 Microsoft.VSTS.Common.AcceptanceCriteria --org myorg --project myproject

# Pipe to a file
azdo get-md-field 12345 System.Description > description.md
```

---

## `set-md-field`

### Synopsis

```
azdo set-md-field <id> <field> [content] [options]
```

### Arguments

| Argument  | Required | Description                                          |
| --------- | -------- | ---------------------------------------------------- |
| `id`      | Yes      | Work item ID (positive integer)                      |
| `field`   | Yes      | Field reference name (e.g., `System.Description`)    |
| `content` | No       | Inline markdown content (quoted string)              |

### Options

| Option              | Description                                      |
| ------------------- | ------------------------------------------------ |
| `--file <path>`     | Read markdown content from file                  |
| `--org <org>`       | Azure DevOps organization                        |
| `--project <project>` | Azure DevOps project                          |
| `--json`            | Output update result as JSON                     |

### Content Source Precedence

1. **Inline argument** (if `content` provided)
2. **`--file`** (if option provided)
3. **stdin** (auto-detected when not a TTY)
4. **Error** (if none available)

Inline + `--file` together → error.

### Output

- **stdout**: Confirmation message (e.g., `Updated work item 12345: System.Description set as markdown`), or JSON object if `--json` is set (e.g., `{"id":12345,"rev":3,"field":"System.Description","value":"..."}`)
- **stderr**: Error messages
- **Exit code**: 0 on success, 1 on error

### Behavior

1. Resolve content source (inline > file > stdin > error)
2. Validate: no conflicting sources, content is non-empty
3. Resolve org/project context (flags > config > git remote)
4. Authenticate via PAT
5. Send JSON Patch with two operations:
   - Set field value: `{ op: "add", path: "/fields/<field>", value: "<content>" }`
   - Set markdown format: `{ op: "add", path: "/multilineFieldsFormat/<field>", value: "Markdown" }`
6. Write confirmation to stdout

### Examples

```bash
# Inline markdown
azdo set-md-field 12345 System.Description "# Overview\n\nThis is a **description**."

# From file
azdo set-md-field 12345 System.Description --file ./description.md

# From stdin (pipe)
cat description.md | azdo set-md-field 12345 System.Description

# From another command
generate-release-notes | azdo set-md-field 12345 System.Description
```

---

## Error Messages

| Condition                     | stderr Message                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| Invalid work item ID          | `Error: Work item ID must be a positive integer. Got: "<input>"`                                     |
| Work item not found           | `Error: Work item <id> not found in <org>/<project>.`                                                |
| Auth failed                   | `Error: Authentication failed. Check that your PAT is valid and has the "Work Items (Read & Write)" scope.` |
| Permission denied             | `Error: Access denied. Your PAT may lack write permissions for project "<project>".`                 |
| Network error                 | `Error: Could not connect to Azure DevOps. Check your network connection.`                           |
| Update rejected               | `Error: Update rejected: <server message>`                                                           |
| File not found                | `Error: File not found: "<path>"`                                                                    |
| File not readable             | `Error: Cannot read file: "<path>"`                                                                  |
| Conflicting sources           | `Error: Cannot specify both inline content and --file. Use one or the other.`                        |
| No content provided           | `Error: No content provided. Provide markdown as an argument, via --file, or pipe through stdin.`    |
| Org/project missing           | `Error: Could not determine org/project. Use --org and --project flags, work from an Azure DevOps git repo, or run "azdo config set org/project".` |
