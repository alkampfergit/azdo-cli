# Implementation Plan: DPAPI credential store

**Branch**: `feature/043-dpapi-credential-store` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

## Summary

The keyring `Entry` already has the only surface the credential store needs
(`getPassword` / `setPassword` / `deletePassword`). A `DpapiEntry` implements the
same surface over a file, and `entryFor()` in `credential-store.ts` picks one or
the other — so storage, migration guard, audit and every command above it are
untouched.

## Technical Context

**Language/Version**: TypeScript 5.x (`strict: true`) on Node.js LTS
**Primary Dependencies**: commander.js, `@napi-rs/keyring` (existing),
**`@primno/dpapi` (new)**
**Storage**: `~/.azdo/credentials/*.dpapi` when selected; `~/.azdo/config.json`
gains `credentialStore`
**Testing**: vitest with a fake DPAPI binding (`vi.mock` of `dpapi-binding.ts`)

## Design

- `src/services/credential-store-kind.ts` — `parseCredentialStore()` (values,
  Windows-only check). Its own module so the many suites that mock
  `config-store.js` keep working.
- `src/services/config-store.ts` — `credentialStore` setting; validated on `set`;
  excluded from `org-copy default`.
- `src/services/dpapi-binding.ts` — lazy `createRequire` load of the addon.
- `src/services/dpapi-store.ts` — `DpapiEntry`, file naming, entropy, atomic
  write, round trip, specific exit-4 messages.
- `src/services/credential-store.ts` — `activeCredentialStore()`,
  `probeBackend()` → `windows-dpapi`, `entryFor()` switch, legacy migration
  skipped, `wrapUnavailable` keeps an already-specific error.
- `src/types/credential.ts` — `windows-dpapi` backend; optional message on
  `CredentialStoreUnavailableError`; Credential Manager hint.
- `src/commands/config.ts` — help text; wizard skips the key.

## Constitution Check

| Principle | Compliance |
| --- | --- |
| I. CLI-First | No new command; one config key and one env var. Exit codes reuse the `auth` contract (4 = store unavailable). |
| II. TypeScript Strictness | `CredentialStoreKind` union; the addon is typed by a local `DpapiBinding` interface. |
| III. Single Responsibility | The store only persists; selection is config. |
| IV. npm Distribution | **New runtime dependency** `@primno/dpapi`. Justification: the alternative spawns PowerShell per credential read (R-1). It is N-API with prebuilds (no compiler), has one tiny dependency, its install script is a no-op, it is external in the bundle like `@napi-rs/keyring`, and it is only loaded when `dpapi` is selected. |
| V. Simplicity | Same `Entry` surface; no migration command, no ACL code. |
| VI. Azure DevOps API Research | N/A — no Azure DevOps API change. |

## Documentation

`docs/authentication.md` (new *Windows: DPAPI credential store* section, ladder
step 2, exit-4 row), `docs/commands.md` (config example),
`docs/changelogs/unreleased.md`, and `README.md` (Constitution VII: the
features bullet names the `credentialStore` setting and the
`--copy-credentials` / `--no-copy-credentials` flags; the quick start shows the
one-time console switch).
