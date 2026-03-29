# PR Report: Work Item Comments

**Branch**: `010-work-item-comments`
**Date**: 2026-03-28
**Spec**: [specs/010-work-item-comments/spec.md](specs/010-work-item-comments/spec.md)

## Summary

This change adds work item comment commands to the CLI so users and agents can review work item discussion without leaving the terminal. It also lets automation post progress updates directly to a work item, closing a gap in the current workflow for status reporting and context gathering.

## What's New

- **CLI Commands**: Added a new `azdo comments` command group with `list` and `add` subcommands so work item discussion can be read and updated directly from the terminal.
- **Work Item Transport**: Extended the existing Azure DevOps work item client to read paginated comment history, filter deleted comments from the default view, and post new comments through the work item comments API.
- **Automation Contract**: Added stable result types, JSON output, validation, and unit coverage for comment listing and creation so agent workflows can consume the feature reliably.

## Testing

- **Unit**: Extended `tests/unit/azdo-client.test.ts` to cover paginated comment retrieval, deleted-comment filtering, and add-comment response mapping.
- **Unit**: Added `tests/unit/comments-list.test.ts` and `tests/unit/comments-add.test.ts` for validation, human-readable output, JSON output, and read/write error handling.
- **Manual**: Verified `node dist/index.js comments --help` exposes the new command group and both subcommands.

## Notes

- Azure DevOps work item comments use the `7.1-preview.4` comments endpoint, so this feature intentionally stays within read/add support and does not attempt comment editing or deletion.
