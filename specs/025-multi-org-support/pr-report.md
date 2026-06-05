# PR Report: Multi-Organization Support

**Branch**: `025-multi-org-support`
**Date**: 2026-06-05
**Spec**: [specs/025-multi-org-support/spec.md](specs/025-multi-org-support/spec.md)

## Summary

Extends the Azure DevOps CLI to work reliably across multiple organizations: users can now maintain a default configuration plus per-org overrides (with full list/copy/move/delete management), commands recover gracefully when configured custom fields are absent in a target org (warn and render rather than failing outright), and org/project context is auto-detected from any Azure DevOps git remote — not only `origin`. Two quality-of-life improvements land alongside: git's own stderr noise is suppressed outside git repos, and the embedded-credentials warning fires only when a password/token is genuinely present (not for bare-username clone URLs).

## What's New

- **[`config-store.ts` — per-org scoping]**: [Placeholder — filled in step 11]
- **[`config` CLI — org-scoped commands]**: [Placeholder — filled in step 11]
- **[`azdo-client.ts` — TF51535 graceful degradation]**: [Placeholder — filled in step 11]
- **[`git-remote.ts` — multi-remote discovery]**: [Placeholder — filled in step 11]
- **[`remote-warning.ts` — credential-only trigger]**: [Placeholder — filled in step 11]

## Testing

- **Unit**: [Placeholder — filled in step 11]
- **Integration**: [Placeholder — filled in step 11]

## Notes

- No new runtime dependencies — existing TypeScript 5.x / commander.js / native `fetch` stack.
- Backward-compatible config file: existing single-org configs continue to work unchanged as the default scope.
