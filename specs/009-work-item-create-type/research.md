# Research: Work Item Create by Type

**Date**: 2026-03-28
**Feature**: 009-work-item-create-type

## R1: How to expose create-time work item type

**Decision**: Add a create-only `--type <work item type>` option to `azdo upsert`.

**Rationale**: The current command already distinguishes create vs update using the optional positional ID. Azure DevOps create requests encode the work item type in the create URL, so an explicit command option is the smallest change that maps directly to the transport requirement without altering the markdown document format.

**Alternatives considered**:
1. Put the type in YAML front matter. Rejected because the create endpoint still needs the type outside the patch document and this would create two possible sources of truth.
2. Add separate commands such as `create-item` and `update-item`. Rejected because the repo already established `upsert` as the single document-driven workflow.
3. Infer type from the title, tags, or other fields. Rejected because it is ambiguous and not user-controlled.

## R2: Backward compatibility strategy

**Decision**: Preserve `Task` as the default create type when `--type` is omitted.

**Rationale**: Existing docs, tests, and user flows describe `upsert` as Task-oriented today. Defaulting to `Task` keeps those flows stable while still unlocking explicit Bug, User Story, Feature, and Epic creation.

**Alternatives considered**:
1. Require `--type` for all creates. Rejected because it would be a needless breaking change.
2. Change the default to `User Story`. Rejected because it would silently alter current behavior.

## R3: Update-mode behavior

**Decision**: Reject `--type` when a work item ID is provided.

**Rationale**: The request is to choose the type at create time. Accepting `--type` during updates would imply the CLI supports changing an existing work item's type, which is outside the requested scope and would make failures harder to interpret.

**Alternatives considered**:
1. Ignore `--type` on update. Rejected because silent ignores are poor CLI ergonomics for automation.
2. Attempt type migration on update. Rejected because it expands the feature into existing-item conversion semantics.

## R4: Result reporting

**Decision**: Extend the upsert result shape and human-readable output to include the resulting work item type.

**Rationale**: Once `upsert` can create non-Task items, reporting "Created task" is incorrect. The Azure DevOps write response already includes `System.WorkItemType`, so the result can expose it without an extra network call.

## Autonomous Decisions

- Chose the executable spec-kit branch convention (`009-work-item-create-type`) over the constitution's prose mention of `feature/` prefixes because the repository scripts validate only numeric-prefixed feature branches.
