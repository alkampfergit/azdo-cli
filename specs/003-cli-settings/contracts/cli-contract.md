# CLI Contract: Config Commands

## Command Group: `azdo config`

### `azdo config set <key> <value>`

Set a configuration value.

| Parameter | Type     | Required | Description                        |
| --------- | -------- | -------- | ---------------------------------- |
| key       | argument | Yes      | Setting key (org, project, fields) |
| value     | argument | Yes      | Value to set                       |

**Recognized keys**: `org`, `project`, `fields`

**stdout** (human-readable):
```
Set "org" to "myorganization"
```

**stdout** (`--json`):
```json
{ "key": "org", "value": "myorganization" }
```

**stderr** (error - unknown key):
```
Error: Unknown setting key "foo". Valid keys: org, project, fields
```

**Exit codes**: 0 success, 1 error

---

### `azdo config get <key>`

Get a configuration value.

| Parameter | Type     | Required | Description     |
| --------- | -------- | -------- | --------------- |
| key       | argument | Yes      | Setting key     |

**stdout** (human-readable):
```
myorganization
```

**stdout** (`--json`):
```json
{ "key": "org", "value": "myorganization" }
```

**stdout** (not set, human-readable):
```
Setting "org" is not configured.
```

**Exit codes**: 0 success (even if not set), 1 error

---

### `azdo config list`

List all configuration values.

**stdout** (human-readable):
```
org       myorganization
project   myproject
fields    System.Tags,Microsoft.VSTS.Common.Priority
```

**stdout** (no settings, human-readable):
```
No settings configured.
```

**stdout** (`--json`):
```json
{
  "org": "myorganization",
  "project": "myproject",
  "fields": ["System.Tags", "Microsoft.VSTS.Common.Priority"]
}
```

**Exit codes**: 0 success

---

### `azdo config unset <key>`

Remove a configuration value.

| Parameter | Type     | Required | Description     |
| --------- | -------- | -------- | --------------- |
| key       | argument | Yes      | Setting key     |

**stdout** (human-readable):
```
Unset "org"
```

**stdout** (`--json`):
```json
{ "key": "org", "unset": true }
```

**Exit codes**: 0 success (even if key was not set), 1 error

---

## Modified Command: `azdo get-item <id>`

### New Option: `--fields`

| Option     | Type   | Required | Description                                           |
| ---------- | ------ | -------- | ----------------------------------------------------- |
| --fields   | string | No       | Comma-separated field reference names (overrides saved)|

**Behavior changes**:
- When `--org`/`--project` not provided and not in Azure DevOps git repo, falls back to saved defaults
- When `--fields` provided, uses those fields instead of saved `fields` setting
- When `fields` setting exists and `--fields` not provided, uses saved setting
- Additional fields appear after default fields in output

**Additional fields output format** (human-readable):
```
ID:          12345
Type:        User Story
Title:       My work item
State:       Active
Assigned To: John Doe
Area:        MyProject\Team1
Iteration:   MyProject\Sprint 1
URL:         https://dev.azure.com/...
Tags:        frontend, bug
Priority:    2

Description:
...
```

**Additional fields in JSON output**:
```json
{
  "id": 12345,
  "type": "User Story",
  "title": "My work item",
  "state": "Active",
  "assignedTo": "John Doe",
  "areaPath": "MyProject\\Team1",
  "iterationPath": "MyProject\\Sprint 1",
  "url": "https://dev.azure.com/...",
  "extraFields": {
    "System.Tags": "frontend, bug",
    "Microsoft.VSTS.Common.Priority": "2"
  },
  "description": "..."
}
```
