# Plan: `azdo list-items`
- `src/services/azdo-client.ts`: `buildListWiql`, `queryWorkItems` (WIQL + batch, TF51535 retry).
- `src/commands/list-items.ts`: command, `parseTop`, JSON/text output; registered in `src/program.ts`.
- Types in `src/types/work-item.ts`.
- Docs: `docs/commands.md`, README feature line, changelog, AGENTS.md.
