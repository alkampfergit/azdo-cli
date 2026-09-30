# Implementation Plan: Settings reference in `azdo config --help`

**Branch**: `feature/046-config-help` | **Spec**: [spec.md](./spec.md)

## Summary

Extend the settings registry with the three facts the help needs and did not
have (`scoped`, `values`, `env`), render a *Settings* block from it, and make
the subcommands' `<key>` text and pointer come from the same list.

## Technical Context

TypeScript 5.x strict, commander.js, vitest. No new dependencies, no I/O
change, no Azure DevOps API involvement (Principle VI does not apply).

## Constitution Check

- CLI-first, help text only, no new command — PASS (I, III).
- Single source: help, validation (`SCOPED_KEYS`) and value list
  (`CREDENTIAL_STORES`) share one registry — PASS (V, no new abstraction
  beyond three fields and one render function).
- Docs updated in `docs/`, README untouched per AGENTS.md convention — PASS.

## Design

| File | Change |
|------|--------|
| `src/services/config-store.ts` | `SettingDefinition` gains `scoped: boolean`, `values?: SettingValueDefinition[]`, `env?: string`. `credentialStore` gets `values` from `CREDENTIAL_STORES` mapped through a `Record<CredentialStoreKind, string>` of notes (compile error if a store has no note) and `env: 'AZDO_CREDENTIAL_STORE'`. `SCOPED_KEYS` is derived from `scoped`. Its description drops the duplicated value list. |
| `src/commands/config.ts` | `renderSettingsHelp(settings = SETTINGS)` returns the block (key column, then `type:`/`values:`, `scope:`, `required`, `env:`, `example:` lines; no trailing newline so the seam with the credential block is one blank line). Wired with `addHelpText('after')` before the existing credential block. `KEY_ARGUMENT_HELP` and `KEY_HELP_POINTER` used by `set`/`get`/`unset`. |
| `tests/unit/config-help.test.ts` | Drives `outputHelp()` (the only path that includes `addHelpText` blocks) and pins every key, every store value, the Windows-only note, the env override, scope wording, required marks, block order, and the subcommand pointers. |
| `docs/commands.md` | New *Settings* table under *Configuration*. |
| `docs/authentication.md` | DPAPI section links to the table and mentions `config --help`. |
| `docs/changelogs/unreleased.md`, `AGENTS.md` | Entries. |

## Decisions

- Pointer, not a copy, on `set|get|unset --help` (owner, #118).
- No `config describe <key>` (owner, #118).
- Booleans render as `type: true | false` and `string[]` as
  `type: comma-separated list` rather than adding `values` for them; only
  `credentialStore` has a genuinely closed, annotated set.
