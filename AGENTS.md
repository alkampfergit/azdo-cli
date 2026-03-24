# azdo-cli Agent Notes

This repository already maintains project memory in [CLAUDE.md](/workspaces/azdo-cli/CLAUDE.md).

For Codex work:
- Treat `CLAUDE.md` as the authoritative project memory and planning summary.
- Do not rewrite, migrate, or duplicate Claude-specific memory unless explicitly asked.
- Add Codex-specific guidance here only when it is truly agent-specific and cannot live in `CLAUDE.md`.

## Codex Memory

- Use this file for Codex-only working memory; keep repository memory in [CLAUDE.md](/workspaces/azdo-cli/CLAUDE.md) and reference it instead of duplicating it here.
- For work item writes, the transport layer already accepts an arbitrary JSON Patch operation array via `updateWorkItem()`. Command-level limits are narrower than client-level limits.
- `set-md-field` currently exposes exactly one `<field>` argument and emits two operations for that field: `/fields/<field>` and `/multilineFieldsFormat/<field>` with `Markdown`.

Working defaults:
- Run `npm test && npm run lint` before wrapping up when the change warrants it.
- Prefer minimal, targeted edits that preserve the existing CLI structure.
