# Tasks: 045-command-reference-docs

- [X] **T001** `docs/commands.md`: complete the cheat sheet (pr, pipeline, attachments, relations).
- [X] **T002** `docs/commands.md`: *Work item attachments* and *Work item relations* sections.
- [X] **T003** `docs/commands.md`: credential resolution order, `credentialStore`, *Authentication commands*; `pr open` always targets `develop`.
- [X] **T004** `docs/commands.md`: *JSON output contracts* (pull requests, work items, pipelines, auth/config) and the list of commands without `--json`.
- [X] **T005** `tests/unit/docs-command-reference.test.ts` (new): drift guard over `createProgram()`; verified it fails on the 0.20.0 page.
- [X] **T006** `context7.json` (new).
- [X] **T007** `docs/changelogs/unreleased.md`, `CLAUDE.md` / `AGENTS.md` Recent Changes.
- [X] **T008** `npm test && npm run lint` green.
