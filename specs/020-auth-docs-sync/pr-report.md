# PR Report: Sync authentication docs

**Branch**: `020-auth-docs-sync`
**Date**: 2026-05-29
**Spec**: [specs/020-auth-docs-sync/spec.md](spec.md)

## Summary

The authentication documentation had drifted from the CLI: the entry-point docs (`README.md`, `docs/commands.md`) predated the OAuth work (#37/#38) and only described the PAT path, making `azdo auth login` look unsupported (issue #41). This PR reconciles the auth docs with the actual `develop` command surface — documenting `azdo auth login` (OAuth default) alongside the PAT alternative — and verifies every documented command/flag against the built CLI. Documentation only; no source or behaviour changes.

## What's New

<!-- finalised in step 11 -->

- [Filled in once /speckit-implement completes]

## Testing

<!-- finalised in step 11 -->

- **Manual**: [Filled in once /speckit-implement completes — quickstart verification: build CLI, diff docs against `--help`, link check]

## Notes

- Per the owner's **Option A** decision: `azdo auth login` is documented as current even though it is unreleased (on `develop`, no tag yet — latest release `0.10.1` predates it). No per-release version caveat. Cutting a release is out of scope for this issue.
