# Feature Specification: document the 400-character description cut

**Feature Branch**: `feature/057-pr-description-truncation-docs`
**Created**: 2026-10-09
**Status**: Approved (issue #148, owner: "ok go")

## Requirements
- **FR-1**: `pr list --help` and `pr status --help` state that `description` is truncated at 400 characters and name `azdo pr comments --pr-number <N> --json` for the full text.
- **FR-2**: `pr update --help` recommends starting from the full description of `pr comments --json`, never from `pr list`/`pr status`.
- **FR-3**: `docs/commands.md` carries the same warnings.

## Out of scope
The optional `descriptionTruncated` flag: a description of exactly 400 characters is indistinguishable from a cut one, so the flag would be a guess. Behaviour is unchanged.
