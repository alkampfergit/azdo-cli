# PR Report: Pull Request Status Checks

**Branch**: `011-pr-status-checks`
**Date**: 2026-03-31
**Spec**: [specs/011-pr-status-checks/spec.md](specs/011-pr-status-checks/spec.md)

## Summary

This feature extends `azdo pr status` so it returns Azure DevOps pull request check results alongside each discovered pull request. It lets users and agents see pending, successful, failed, and errored checks from the terminal, including available detail text when Azure DevOps provides it.

## What's New

- **PR status checks**: `azdo pr status` now looks up Azure DevOps pull request status checks for each returned pull request and nests them under the matching PR in both text and JSON output.
- **Error detail rendering**: Failed and errored checks now print available Azure DevOps description text so reviewers can see blocking detail without leaving the terminal.
- **PR client contracts**: The pull request service and type layer now expose a dedicated check lookup plus stable mapped check fields for automation and unit coverage.

## Testing

- **Unit**: Extended `tests/unit/pr-client.test.ts` for Azure DevOps pull request status-check mapping, filtering, fallback naming, and auth failure handling.
- **Unit**: Extended `tests/unit/pr-status.test.ts` for text rendering, empty-check output, failed/error detail output, JSON shape, and check lookup failure handling.
- **Repo quality gates**: Ran `npm test && npm run lint`.
