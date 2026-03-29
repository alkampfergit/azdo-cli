# Research: Work Item Comments

**Date**: 2026-03-28
**Feature**: 010-work-item-comments

## R1: How to expose work item comment operations in the CLI

**Decision**: Add a top-level `comments` command group with `comments list <id>` and `comments add <id> <text>`.

**Rationale**: The user explicitly referenced `azdo comments add <id> "..."`, and the repo already uses a grouped-command pattern for related workflows in `pr`. A dedicated group keeps comment operations discoverable without overloading `get-item` or `upsert`.

**Alternatives considered**:
1. Add a `--comments` flag to `get-item`. Rejected because reading and writing comments are separate workflows and a flag would not provide a clean place for `add`.
2. Add comment support to `upsert`. Rejected because comments are discussion events, not work item field synchronization.
3. Create nested `work-item comments` commands. Rejected because the current CLI does not use nested top-level resource groups and the user example already established the shorter `comments` form.

## R2: Where to implement Azure DevOps comment transport

**Decision**: Extend `src/services/azdo-client.ts` with `listWorkItemComments()` and `addWorkItemComment()`.

**Rationale**: Work item comments belong to the same Azure DevOps Work Item Tracking domain as the existing read/write operations already implemented in `azdo-client.ts`. Reusing `authHeaders()`, `fetchWithErrors()`, and the current error-handling pattern keeps the change small and consistent.

**Alternatives considered**:
1. Create a new `comments-client.ts`. Rejected because it would duplicate work-item auth and transport helpers for a narrowly related API.
2. Put HTTP logic directly in `src/commands/comments.ts`. Rejected because command modules in this repo stay thin and defer transport to services.

## R3: How to model work item discussion history

**Decision**: Treat work item comments as a flat chronological history, returned newest first, and omit deleted comments by default.

**Rationale**: Azure DevOps work item comments are retrieved as a list of comments rather than PR review threads. Newest-first output keeps recent context and decisions immediately visible in terminal workflows, while deleted comments would add noise without helping current decision-making.

**Alternatives considered**:
1. Emulate PR-style thread grouping. Rejected because work item comments are not exposed as active file threads.
2. Show oldest-first. Rejected because it buries recent context and forces scrolling for the latest state.
3. Include deleted comments by default. Rejected because the primary use case is active context review, not audit reconstruction.

## R4: How to retrieve the full visible history

**Decision**: Use the Azure DevOps work item comments list endpoint with descending order and follow continuation tokens until no further page remains.

**Rationale**: The feature requirement is to read discussion history, not just a single page. Azure DevOps exposes work item comments through a paged API, so the CLI should absorb pagination internally and return one logical history result to the caller.

**Alternatives considered**:
1. Return only the first page. Rejected because it would silently hide older context.
2. Require the caller to pass paging flags. Rejected because it complicates the MVP and shifts a transport concern onto the user.

## R5: How to create new comments

**Decision**: Post the user-supplied text as the request body `text` field through the Azure DevOps add-comment endpoint and reject whitespace-only input locally.

**Rationale**: The Azure DevOps comment create API accepts a simple text payload, and the user request centers on quick progress updates from agents. Local validation prevents meaningless writes and keeps automation failures deterministic.

**Alternatives considered**:
1. Add file-based comment input in the MVP. Rejected because the request only asked for direct terminal updates and a positional argument is simpler.
2. Rewrite or sanitize markdown before sending. Rejected because the feature should preserve the caller's authored update verbatim.

## R6: Output shape and error handling

**Decision**: Provide human-readable summaries and `--json` result objects for both commands, while reusing existing work item auth/not-found/permission error handling conventions.

**Rationale**: The constitution requires JSON where applicable, and the feature is explicitly agent-facing. Existing `handleCommandError()` behavior already maps common Azure DevOps failures into actionable CLI messages, so comments should align with that pattern.

## Autonomous Decisions

- Chose the executable spec-kit branch convention (`010-work-item-comments`) over the constitution's prose mention of `feature/` prefixes because the repository scripts and existing specs use numeric-prefixed branches.
- Chose to keep comment-specific interfaces in `src/types/work-item.ts` rather than adding a separate type file because the change stays within the work item domain and the repo favors minimal structure.
- Chose a positional `<text>` argument for `comments add` because it matches the user example directly and keeps the initial command contract smaller than adding `--content` and `--file`.
