# PR Report: Settings reference in `azdo config --help`

**Branch**: `feature/046-config-help`
**Date**: 2026-09-30
**Spec**: [specs/046-config-help/spec.md](./spec.md)

## Summary

`azdo config --help` now prints a *Settings* section: every key with its
meaning, type or accepted values, scope, environment override and a
paste-ready `azdo config set` example. It is rendered from the CLI's own
settings registry, so `azdo config set credentialStore dpapi` (the line the
issue could not find) is now discoverable from the command itself, and a
future key cannot be forgotten. `set`, `get` and `unset` name the keys from
the same registry and point at `azdo config --help`.

## What's New

- **`src/services/config-store.ts`**: `SettingDefinition` gains `scoped`,
  `values?` and `env?`; `credentialStore`'s values come from
  `CREDENTIAL_STORES` with a per-kind note (typed `Record`, so a new store
  without a note fails to compile); `SCOPED_KEYS` is derived from `scoped`
  instead of a second hand-written list.
- **`src/commands/config.ts`**: `renderSettingsHelp()` and its wiring as the
  first `after` help block; registry-driven `<key>` argument text and a
  one-line pointer on `set` / `get` / `unset`.
- **`docs/commands.md`**: *Settings* table under *Configuration*.
- **`docs/authentication.md`**: DPAPI section links to the table.
- **`docs/changelogs/unreleased.md`**, **`AGENTS.md`**: entries.

## Testing

- **Unit**: new `tests/unit/config-help.test.ts` (9 tests) drives the real
  `outputHelp()` path — `helpInformation()` omits `addHelpText` blocks — and
  pins every registered key, description and example; every `credentialStore`
  value, the Windows-only note and `AZDO_CREDENTIAL_STORE`; scope wording per
  key; required marks; the block order and the single blank line between the
  settings and credential blocks; and the `set|get|unset` pointers.
- **Full suite**: 1407 passed / 129 skipped; `npm run lint` clean; `tsc
  --noEmit` clean; `npm run build` success.

## Notes

- No behaviour change: validation messages, exit codes and every `config`
  command's output are unchanged. The only visible text change outside
  `--help` is the `credentialStore` description in `config list`, which no
  longer repeats the value list now shown in the help.
- `azdo config describe <key>` was deliberately not added (owner, #118).
- README untouched: installation, quick start and command-group table did
  not change.
