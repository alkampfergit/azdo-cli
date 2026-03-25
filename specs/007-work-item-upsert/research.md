# Research: Work Item Upsert

**Date**: 2026-03-24
**Feature**: 007-work-item-upsert

## R1: Create vs Update Transport

**Decision**: Use Azure DevOps work item JSON Patch APIs directly: `POST .../_apis/wit/workitems/$Task?api-version=7.1` for create and `PATCH .../_apis/wit/workitems/{id}?api-version=7.1` for update, both with `Content-Type: application/json-patch+json`.

**Rationale**: The existing CLI already uses JSON Patch for updates, and Microsoft documentation and samples show Task creation using the same patch document model with the work item type embedded in the create URL. Reusing the same operation array structure keeps create and update symmetric, minimizes transport code churn, and fits the current `azdo-client.ts` patterns.

**Alternatives considered**:
1. Split the feature into separate `create-task` and `update-task` commands. Rejected because the spec explicitly requires one `upsert` workflow.
2. Use the work item batch API. Rejected because this feature operates on one item at a time and batching would add avoidable request complexity.
3. Add a higher-level Azure DevOps SDK. Rejected because the repo already uses native `fetch` successfully and has a minimal dependency policy.

## R2: Command Shape for Inline Content

**Decision**: Expose the markdown document through mutually exclusive `--content <markdown>` and `--file <path>` options, with the work item ID as an optional positional argument.

**Rationale**: A positional inline document becomes ambiguous when the ID is optional, because `azdo upsert foo` could mean either a document payload or a work item ID parse failure. Explicit source options remove that ambiguity, preserve a clean create-vs-update command shape, and still satisfy the requirement to accept inline markdown text.

**Alternatives considered**:
1. `azdo upsert [id] [content]`. Rejected because optional positional arguments are ambiguous and fragile for multi-line shell content.
2. Separate create/update syntaxes with different argument positions. Rejected because it weakens the single-command contract.
3. Stdin-only inline support. Rejected because the spec explicitly asks for an inline parameter, not only piped input.

## R3: Document Parsing Strategy

**Decision**: Implement a small custom parser for the constrained task document format: an explicit YAML front matter block at the top for scalar fields, followed by level-2 markdown sections (`## Field Name`) for rich-text fields.

**Rationale**: The repo currently keeps runtime dependencies minimal, and this feature only needs a narrow subset of YAML behavior: scalar strings, quoted strings, empty values, and `null`. A small parser keeps the bundle lean, makes application-specific validation clearer, and avoids pulling in a generic front matter library just to support a tightly constrained format.

**Alternatives considered**:
1. `gray-matter`. Rejected because it adds a new dependency and solves more cases than this format needs.
2. A standalone YAML library. Rejected because body-section parsing would still need custom logic, and the repo does not need full YAML feature coverage.
3. Free-form markdown without explicit front matter. Rejected because the spec already chose YAML front matter plus named sections as the canonical format.

## R4: Field Canonicalization and Rich-Text Detection

**Decision**: Normalize a fixed set of common friendly names to Azure DevOps reference names using a case-insensitive alias table, and infer field handling from document location: front matter entries are scalar field updates, section entries are markdown field updates.

**Rationale**: The spec only promises friendly names for known common fields, not full display-name support for every possible field. An explicit alias table keeps behavior deterministic. Using document location to decide scalar vs markdown behavior avoids live field-metadata lookups, supports reference names for arbitrary fields, and gives users a predictable rule: put markdown content in a section, put scalar content in front matter.

Representative aliases to support:
- `Title` → `System.Title`
- `Assigned To` → `System.AssignedTo`
- `State` → `System.State`
- `Description` → `System.Description`
- `Acceptance Criteria` → `Microsoft.VSTS.Common.AcceptanceCriteria`
- `Repro Steps` → `Microsoft.VSTS.TCM.ReproSteps`
- `Area Path` → `System.AreaPath`
- `Iteration Path` → `System.IterationPath`

**Alternatives considered**:
1. Fetch Azure DevOps field metadata at runtime and accept any display name. Rejected because it adds network round-trips and ambiguity when display names collide.
2. Infer markdown fields from field names alone. Rejected because custom multiline fields would be impossible to classify reliably without metadata.
3. Allow duplicate declarations and let the last one win. Rejected because the spec requires actionable validation for ambiguous input.

## R5: Validation and Clear Semantics

**Decision**: Validate document structure and duplicate/canonical field collisions locally, require a non-empty Title for create operations, treat scalar empty values or `null` as explicit clears, treat present-but-empty markdown sections as explicit clears, and represent clears with empty-string field values in JSON Patch operations.

**Rationale**: Existing command behavior already clears `System.AssignedTo` with an empty string, so the same convention fits this feature and avoids introducing `remove` semantics that are inconsistent with current code. Requiring Title locally covers the one universal Task creation requirement this CLI can know ahead of time. Any additional process-specific server rules should still surface via Azure DevOps error messages, but the local parser should catch format and duplicate errors before the API call.

**Alternatives considered**:
1. Use JSON Patch `remove` operations for clears. Rejected because existing command behavior uses empty strings and Azure DevOps field-clearing behavior is already aligned with that pattern.
2. Pre-fetch work item type metadata to discover every required field. Rejected because it adds complexity and remote coupling beyond the current CLI scope.
3. Allow missing Title on create and rely entirely on server rejection. Rejected because the spec explicitly requires client-side validation for minimum create requirements.
