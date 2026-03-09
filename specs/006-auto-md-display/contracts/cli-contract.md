# CLI Contract: Auto Markdown Display

**Feature**: 006-auto-md-display
**Date**: 2026-03-09

## Modified Commands

### `azdo get-item <id>` (extended)

**New options**:

| Option          | Type    | Default | Description                                  |
|-----------------|---------|---------|----------------------------------------------|
| `--markdown`    | boolean | -       | Convert rich text fields to markdown          |
| `--no-markdown` | boolean | -       | Display rich text as stripped HTML (override)  |

**Behavior**:
- When markdown is active: Description and HTML-containing extra fields rendered as markdown
- When markdown is inactive: Existing behavior preserved (stripped HTML for Description, raw for extra fields)

**Flag resolution**: `--markdown`/`--no-markdown` > `config.markdown` > `false`

**Examples**:
```bash
# Per-command markdown
azdo get-item 42 --markdown

# Override config setting
azdo get-item 42 --no-markdown

# With extra fields
azdo get-item 42 --fields Microsoft.VSTS.TCM.ReproSteps --markdown
```

### `azdo config set markdown <value>` (existing command, new key)

**New valid key**: `markdown`
**Valid values**: `true`, `false`

**Examples**:
```bash
# Enable markdown globally
azdo config set markdown true

# Disable markdown globally
azdo config set markdown false

# Check current setting
azdo config get markdown

# Remove setting (revert to default)
azdo config unset markdown
```

## Output Format Changes

### Description field (markdown mode active)

**Before** (stripped HTML):
```
Description:
--- Overview ---
This is a description with bold text and a link
```

**After** (markdown mode):
```
Description:
## Overview
This is a description with **bold text** and [a link](https://example.com)
```

### Extra fields (markdown mode active)

HTML-containing extra fields are converted; plain text fields are unchanged.
