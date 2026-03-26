# Research: Auto Markdown Display for Rich Text Fields

**Feature**: 006-auto-md-display
**Date**: 2026-03-09

## R1: Boolean Config Setting Pattern

**Decision**: Add `markdown` as a boolean config key to `CliConfig`, stored as `boolean` type in `config.json`.

**Rationale**: The existing config system uses `string` and `string[]` types. A boolean is the simplest representation for a toggle setting. Commander.js natively supports `--markdown` / `--no-markdown` flag pairs via `.option('--markdown')` which produces a boolean. The config store already uses `JSON.stringify`/`JSON.parse`, so `true`/`false` JSON booleans serialize correctly without any special handling.

**Alternatives considered**:
- String `"true"/"false"` with parsing: Adds unnecessary conversion complexity; JSON already has native booleans.
- Separate `markdown-mode` enum: Over-engineered for a simple on/off toggle.

## R2: Integration Point for Markdown Conversion in get-item

**Decision**: Modify `formatWorkItem()` in `get-item.ts` to accept a `markdown` boolean parameter. When `true`, use `toMarkdown()` (from `md-convert.ts`) instead of `stripHtml()` for the Description field and for any HTML-containing extra fields.

**Rationale**: The `toMarkdown()` function already handles HTML detection internally (calls `isHtml()` and converts only if HTML is detected). This makes it safe to call on any field value — plain text passes through unchanged (FR-005). The `formatWorkItem` function is the single rendering point for work item display, making it the ideal place to switch behavior.

**Alternatives considered**:
- Creating a new `formatWorkItemMarkdown()` function: Duplicates logic unnecessarily.
- Wrapping at the command level (post-processing stdout): Fragile, would break structured output.

## R3: Flag Resolution Order

**Decision**: Resolution order: `--markdown` / `--no-markdown` flag → `config.markdown` → default `false`.

**Rationale**: This follows the existing precedent in the project where CLI flags override config values (e.g., `--org` overrides `config.org`). Commander.js `.option('--markdown')` naturally produces `undefined` when not passed, `true` for `--markdown`, and `false` for `--no-markdown`, making three-state detection straightforward.

**Alternatives considered**:
- Environment variable layer: YAGNI — no other settings use env vars for display preferences.

## R4: Config Store Changes

**Decision**: Add `markdown?: boolean` to `CliConfig` interface, add a `SettingDefinition` entry with `type: 'boolean'`, and update `setConfigValue()` to handle boolean parsing for the `markdown` key.

**Rationale**: The config store's `validateKey()` and `setConfigValue()` functions gate all config operations. Adding the new key to `SETTINGS` and `CliConfig` makes it automatically available to `config set/get/unset/list/wizard` commands. The only new logic needed is parsing `"true"`/`"false"` strings to booleans in `setConfigValue()`.

**Alternatives considered**:
- Separate boolean config module: Violates simplicity principle; one config store is enough.

## R5: Extra Fields HTML Detection

**Decision**: When markdown mode is active, apply `toMarkdown()` to extra field values just as for Description. The `isHtml()` check inside `toMarkdown()` ensures plain-text fields pass through unchanged.

**Rationale**: Extra fields are currently displayed as raw strings in `formatWorkItem()`. Some extra fields (like `Microsoft.VSTS.TCM.ReproSteps`, `Microsoft.VSTS.Common.AcceptanceCriteria`) contain HTML. The existing `toMarkdown()` function is safe for all field values.

**Alternatives considered**:
- Maintaining a whitelist of known HTML fields: Brittle — Azure DevOps allows custom fields that could also contain HTML.
- Only converting Description: Inconsistent UX when other HTML fields display raw tags.
