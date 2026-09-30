# Implementation Plan: Complete command reference and Context7 index

**Branch**: `feature/045-command-reference-docs` | **Date**: 2026-09-30 | **Spec**: [spec.md](./spec.md)

## Summary

Documentation-only change plus one guard test and one index config file. No
source file under `src/` changes.

## Constitution Check

| Principle | Compliance |
| --- | --- |
| I. CLI-First | No command change; the JSON contracts documented are the existing ones. |
| III. Single Responsibility | Reference in `docs/commands.md`; README untouched (install, quick start, doc table unchanged — per the AGENTS.md documentation convention). |
| V. Simplicity | A string-containment test over the real tree rather than a doc generator. |
| VI. ADO API Research | N/A — no Azure DevOps surface touched. |

## Design

1. **`docs/commands.md`** — cheat-sheet rows for every group; new *Work item
   attachments*, *Work item relations*, *Credential resolution order* and
   *Authentication commands* sections; *JSON output contracts* replaces the old
   one-line *JSON output* list. Every shape was read from the source
   (`src/types/*.ts`, the `JSON.stringify` sites in `src/commands/*.ts`).
2. **`tests/unit/docs-command-reference.test.ts`** — walks `createProgram()`
   (including aliases), asserts each `azdo <path>` and each long option appears in
   the page, and that the stale commands appear only on a "does not exist" line.
3. **`context7.json`** — `excludeFolders` for `specs`, `.specify`, `.agents`,
   tooling dirs, `src`, `tests`, `scripts`, `docs/changelogs`; `excludeFiles` for
   the agent memory files, `CHANGELOG.md` and the unrelated skills guide; `rules`
   stating the entry point, the credential order and the non-existent commands.
