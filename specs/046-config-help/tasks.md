# Tasks: Settings reference in `azdo config --help`

- [x] **T001** `src/services/config-store.ts` — add `scoped` / `values` / `env`
  to `SettingDefinition`, fill the registry, derive `SCOPED_KEYS`.
- [x] **T002** `src/commands/config.ts` — `renderSettingsHelp()`, wire it as the
  first `after` help block; registry-driven `<key>` text and pointer on
  `set` / `get` / `unset`.
- [x] **T003** `tests/unit/config-help.test.ts` — pin the rendered help.
- [x] **T004** [P] `docs/commands.md` — *Settings* table.
- [x] **T005** [P] `docs/authentication.md` — link from the DPAPI section.
- [x] **T006** [P] `docs/changelogs/unreleased.md`, `AGENTS.md` — entries.
- [x] **T007** Run `npm test && npm run lint`.
