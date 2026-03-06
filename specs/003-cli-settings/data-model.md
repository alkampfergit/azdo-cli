# Data Model: CLI Settings

## Entities

### CliConfig

Represents the full CLI configuration stored on disk.

| Field     | Type       | Required | Description                                          |
| --------- | ---------- | -------- | ---------------------------------------------------- |
| org       | string     | No       | Default Azure DevOps organization                    |
| project   | string     | No       | Default Azure DevOps team project                    |
| fields    | string[]   | No       | Additional work item field reference names to display |

**Validation Rules**:
- `org`: non-empty string when present
- `project`: non-empty string when present
- `fields`: array of non-empty strings, each representing a valid Azure DevOps field reference name (e.g., `System.Tags`, `Microsoft.VSTS.Common.Priority`)
- Unknown keys are rejected at the command level

**Storage Format**: JSON file at `~/.azdo/config.json`

```json
{
  "org": "myorganization",
  "project": "myproject",
  "fields": ["System.Tags", "Microsoft.VSTS.Common.Priority"]
}
```

### AzdoContext (existing, extended)

Currently defined in `src/types/work-item.ts`. No structural changes needed - the context resolution logic changes to incorporate saved defaults as a fallback source.

| Field   | Type   | Required | Description                              |
| ------- | ------ | -------- | ---------------------------------------- |
| org     | string | Yes      | Azure DevOps organization                |
| project | string | Yes      | Azure DevOps team project                |

**Resolution order** (unchanged interface, new fallback):
1. Explicit `--org`/`--project` CLI flags
2. Git remote auto-detection
3. Saved defaults from `CliConfig`

### WorkItem (existing, extended)

Currently defined in `src/types/work-item.ts`. Needs an optional field for additional/extra fields.

| Field           | Type                          | Required | Description                                 |
| --------------- | ----------------------------- | -------- | ------------------------------------------- |
| (existing)      | (unchanged)                   | -        | All current fields remain as-is             |
| extraFields     | Record<string, string> | null | No       | Additional field values keyed by field name  |

## State Transitions

### Config File Lifecycle

```
[Not exists] --set--> [Exists with partial keys] --set--> [Exists with more keys]
                            |                                     |
                            +--unset--> [Exists with fewer keys]--+
                            |                                     |
                            +--unset all--> [Empty/removed]       |
                            +-------------------------------------+
```

## Relationships

```
CliConfig --provides defaults--> AzdoContext
CliConfig --provides fields list--> getWorkItem() API call
WorkItem.extraFields --populated by--> additional fields from API response
```
