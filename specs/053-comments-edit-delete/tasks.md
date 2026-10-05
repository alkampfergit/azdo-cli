# Tasks: `azdo comments edit` / `delete`

- [x] **T001** `src/types/work-item.ts` — `UpdateWorkItemCommentResult`, `DeleteWorkItemCommentResult`.
- [x] **T002** `src/services/azdo-client.ts` — `updateWorkItemComment`, `deleteWorkItemComment`.
- [x] **T003** `src/services/command-helpers.ts` — shared `readTextSource` (file / stdin); `pr.ts` delegates.
- [x] **T004** `src/commands/comments.ts` — `edit` (with `--file`) and `delete`.
- [x] **T005** Tests: client (200/204/400/401/403/404), command, tree-level via `createProgram()`.
- [x] **T006** `docs/commands.md`, changelog, `AGENTS.md`.
- [x] **T007** Run `npm test && npm run lint`.
