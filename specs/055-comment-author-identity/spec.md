# Feature Specification: stable comment author identity in JSON

**Feature Branch**: `feature/055-comment-author-identity`
**Created**: 2026-10-07
**Status**: Approved (issue #130, owner: "go")
**Input**: Issue #130 — a display name is not stable, so a caller cannot check an allow list or "is this my own comment" (automata-cli#94, item F3).

## Requirements
- **FR-1**: `comments list --json` comments, and the `author` result of `comments add|edit`, carry `authorUniqueName` and `authorId` next to `author`.
- **FR-2**: `pr comments --json` — every comment in every thread — carries the same two fields.
- **FR-3**: Both are `string | null` (`IdentityRef.uniqueName` / `.id`). Flat siblings, not a nested object: `author` is a string today and turning it into an object would break consumers. Same pattern as `pr list`'s `createdByUniqueName` / `createdById`.
- **FR-4**: `docs/commands.md` documents the fields and which to compare on: `authorId` vs `azdo auth diagnose --json` → `identity.id` for "is this mine", `authorUniqueName` (case-insensitive) for allow lists.

## Notes
`IdentityRef` has no email field; `uniqueName` is the email/UPN for Entra/MSA users and a non-email value for service identities.

## Out of scope
Nested `author` object; `descriptor`; changing the `pr comments add|edit|reply` JSON shapes.
