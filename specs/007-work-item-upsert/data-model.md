# Data Model: Work Item Upsert

**Date**: 2026-03-24
**Feature**: 007-work-item-upsert

## Entities

### UpsertInput

Represents one CLI invocation before parsing.

- **taskId**: `number | null` — existing Task ID to update; `null` means create
- **contentSource**: `'inline' | 'file'` — where the task document came from
- **content**: `string` — raw markdown document text
- **sourcePath**: `string | null` — original file path when `contentSource === 'file'`

Validation rules:
- Exactly one content source must be supplied.
- `taskId`, when present, must be a positive integer.
- `sourcePath`, when present, must exist and be readable.

### ParsedTaskDocument

Represents the parsed markdown task-definition document.

- **frontMatterRaw**: `string` — raw YAML front matter block
- **bodyRaw**: `string` — raw markdown body after front matter
- **scalarFields**: `TaskFieldEntry[]` — front matter entries mapped to scalar fields
- **markdownFields**: `TaskFieldEntry[]` — section entries mapped to markdown fields

Validation rules:
- The document must start with an explicit front matter block delimited by `---`.
- Each markdown field section must use a level-2 heading (`## <field name>`).
- No canonical field may appear more than once across front matter and sections.

### TaskFieldEntry

Represents one user-specified field/value pair after normalization.

- **inputName**: `string` — field name as written by the user
- **fieldName**: `string` — canonical Azure DevOps reference name
- **sourceKind**: `'scalar' | 'markdown'` — inferred from front matter vs section placement
- **value**: `string | null` — normalized value; `null` means explicit clear request from source text
- **clearRequested**: `boolean` — derived convenience flag for patch generation

Validation rules:
- Friendly names must map to a supported canonical field name.
- Arbitrary reference names are allowed when they are syntactically valid and not ambiguous with known aliases.
- Empty scalar values and `null` represent explicit clears.
- Present-but-empty markdown sections represent explicit clears.

### PatchPlan

Represents the exact Azure DevOps operations to send.

- **mode**: `'create' | 'update'`
- **fieldOperations**: `JsonPatchOperation[]` — ordered patch operations for fields and markdown-format markers
- **appliedFields**: `string[]` — canonical field names included in this upsert

Rules:
- Scalar entries emit one `/fields/<field>` operation.
- Markdown entries emit `/fields/<field>` plus `/multilineFieldsFormat/<field>` set to `Markdown`.
- Clear requests emit empty-string field values.
- Create mode requires a non-empty `System.Title` entry.

### UpsertResult

Represents the command outcome returned to the user.

- **action**: `'created' | 'updated'`
- **id**: `number`
- **rev**: `number`
- **title**: `string`
- **appliedFields**: `string[]`
- **deletedSourceFile**: `boolean`

## Relationships

- An **UpsertInput** is parsed into one **ParsedTaskDocument**.
- A **ParsedTaskDocument** is transformed into one **PatchPlan** based on whether `taskId` is present.
- The Azure DevOps client executes the **PatchPlan** and returns an **UpsertResult**.
- File cleanup is a post-success side effect attached to **UpsertInput** when the content source is `file`.

## State Transitions

### Command Flow

1. `received` → source validation passes
2. `validated` → document parsed and canonicalized
3. `planned` → patch operations generated
4. `executed` → Azure DevOps create/update succeeds
5. `cleaned-up` → source file deleted only when the source was `file` and execution succeeded

### Source File Lifecycle

- `present` → initial state for `--file`
- `present` → remains unchanged on parse failure or API failure
- `deleted` → only after a successful create/update response
