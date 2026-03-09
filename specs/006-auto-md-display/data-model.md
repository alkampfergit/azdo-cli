# Data Model: Auto Markdown Display

**Feature**: 006-auto-md-display
**Date**: 2026-03-09

## Modified Entities

### CliConfig (extended)

Existing interface with one new field:

| Field      | Type       | Required | Description                                      |
|------------|------------|----------|--------------------------------------------------|
| org        | string     | no       | Azure DevOps organization name                   |
| project    | string     | no       | Azure DevOps project name                        |
| fields     | string[]   | no       | Extra work item fields to include                |
| **markdown** | **boolean** | **no** | **When true, display rich text fields as markdown** |

**Storage**: `~/.azdo/config.json`

**Default**: `undefined` (treated as `false` — backward compatible)

### SettingDefinition (new entry)

A new entry in the `SETTINGS` array:

| Property    | Value                                               |
|-------------|-----------------------------------------------------|
| key         | `markdown`                                          |
| description | `Convert rich text fields to markdown on display`   |
| type        | `boolean`                                           |
| example     | `true`                                              |
| required    | `false`                                             |

## Resolution Logic

### Markdown Display Resolution

```
Priority (highest → lowest):
1. --markdown flag     → true
2. --no-markdown flag  → false
3. config.markdown     → config value
4. default             → false
```

When resolved to `true`: Use `toMarkdown()` for HTML fields.
When resolved to `false`: Use existing `stripHtml()` for Description, raw display for extra fields.
