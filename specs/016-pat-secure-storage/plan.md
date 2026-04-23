# Implementation Plan: Secure PAT Storage and `auth` Command

**Branch**: `016-pat-secure-storage` | **Date**: 2026-04-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/016-pat-secure-storage/spec.md`

## Summary

Add an `azdo auth` command that interactively captures or imports a PAT, validates it against Azure DevOps, and stores it in the OS-native secret vault **keyed by Azure DevOps organization** (multi-org scope). Every authenticated `azdo` invocation resolves the target org via a hybrid chain (`--org` flag → git remote auto-detect → persistent `azdo config set org` → error), then reads the org's PAT from the vault (env var `AZDO_PAT` wins if set). Two subcommands, `auth status` and `auth logout`, let users inspect and remove stored credentials.

The feature reuses the project's existing infrastructure: `@napi-rs/keyring` (already a dependency via spec 002), `~/.azdo/config.json` (via spec 003), `git-remote` detection (existing), and `auth`/`credential-store` services (existing, single-slot today). The main code changes are: (a) generalise the single-slot credential store to multi-org keying, (b) extract a dedicated `resolveOrg()` helper that implements FR-013's resolution order, (c) add new `auth` command with its subcommands, and (d) a browser-assist helper that shells out to the platform-native `open`/`start`/`xdg-open`.

## Technical Context

**Language/Version**: TypeScript 5.x strict on Node.js LTS (≥18) — no change
**Primary Dependencies**: `commander.js` (CLI), `@napi-rs/keyring` (credential store, already a dependency)
**Storage**: OS secret vault for PATs (Windows Credential Manager / macOS Keychain / Linux libsecret via `@napi-rs/keyring`); `~/.azdo/config.json` for non-secret prefs; `~/.azdo/audit.log` (new, JSON-lines) for credential-event audit trail
**Testing**: vitest — unit tests in `tests/unit/`, integration tests gated off by default (require real Azure DevOps PAT and/or OS vault). No mocks of the keyring for unit tests of the resolution/validation logic; inject the store via a tiny interface.
**Target Platform**: Windows, macOS, Linux with libsecret (as per spec)
**Project Type**: CLI (single project), existing src/ + tests/ layout
**Performance Goals**: P95 < 200 ms for org resolution + PAT lookup + auth-header build on every command; `auth` flow itself is interactive (user-bound).
**Constraints**: No plaintext PAT in any tool-managed file (SC-002). `AZDO_PAT` env var wins over stored PAT (FR-009). Explicit failure when the OS vault is unavailable (FR-010) — no silent plaintext fallback.
**Scale/Scope**: Multi-org; a user may have ≤~10 orgs in practice. No upper limit enforced by the tool.

## Constitution Check

*GATE: passes before Phase 0, re-verified post-design.*

| Principle | Evaluation |
|---|---|
| I. CLI-First Design | `auth`, `auth status`, `auth logout` added as commander commands. POSIX conventions honoured (stdout for data, stderr for prompts/errors; `--json` on `auth status`). |
| II. TypeScript Strictness | No `any`; store interface typed; `Promise<string \| null>` return types. Contracts in `contracts/` define public surface. |
| III. Single Responsibility Commands | Each subcommand does one thing; shared logic lives in `src/services/` (credential-store, auth, org-resolver, audit-log). |
| IV. npm Distribution | No new runtime dependency — the only new runtime code is `src/services/browser-open.ts` which shells out via `node:child_process`. Bundle stays lean. |
| V. Simplicity | No new abstraction framework. Existing services extended in-place. Browser-assist uses native shell exec (no `open`-style library). |

**Gates pass.** Two deviations warrant a Complexity Tracking note (below): a behaviour change to existing `resolveContext` (ordering of git-remote vs config) and a backward-compat migration path for the single-slot credential.

## Project Structure

### Documentation (this feature)

```text
specs/016-pat-secure-storage/
├── plan.md                     # this file
├── research.md                 # Phase 0 decisions
├── data-model.md               # Phase 1 — Stored Credential / Auth Session / Audit Event
├── contracts/
│   ├── auth-command.md         # auth / auth status / auth logout CLI contract
│   ├── credential-store.md     # multi-org keyring API
│   └── org-resolver.md         # resolveOrg() resolution chain contract
├── quickstart.md               # Phase 1 — end-to-end walkthrough
├── checklists/requirements.md  # spec quality checklist (existing)
├── spec.md                     # feature spec (approved)
└── tasks.md                    # Phase 2 — /speckit-tasks output (next phase)
```

### Source Code (repository root)

```text
src/
├── commands/
│   ├── auth.ts                 # NEW — `azdo auth` + `auth status` + `auth logout`
│   ├── clear-pat.ts            # KEEP as a deprecation-aliased thin wrapper calling auth-logout service (see research.md §5)
│   └── ...                     # existing commands (unchanged signatures; some pick up per-org PAT via resolvePat(org))
├── services/
│   ├── auth.ts                 # MODIFIED — resolvePat(org) now takes an org; promptForPat unchanged; adds validatePatAgainstAzdo(pat, org)
│   ├── credential-store.ts     # MODIFIED — Entry(SERVICE, 'pat:<org>'); add listOrgsWithStoredPat(); add audit-log on set/delete
│   ├── config-store.ts         # MODIFIED — adds `azdo config set org` enforcement path (already exists as a setting; add helper if needed)
│   ├── context.ts              # MODIFIED — resolveContext refactored to use new resolveOrg() + resolveProject() helpers
│   ├── org-resolver.ts         # NEW — resolveOrg(opts): (1) --org, (2) git remote, (3) config, (4) error
│   ├── browser-open.ts         # NEW — openUrl(url): xdg-open/open/start, detects headless
│   ├── audit-log.ts            # NEW — appendAuthAuditEvent({event, org, backend, masked_id, ts})
│   └── git-remote.ts           # existing — no change
└── types/
    └── work-item.ts            # MODIFIED — AuthCredential now carries org; new StoredCredentialMeta type

tests/
├── unit/
│   ├── auth.test.ts            # existing — extended for multi-org resolvePat(org), env-var precedence, migration
│   ├── credential-store.test.ts # NEW — multi-org keying, migration, error surfacing when keyring unavailable
│   ├── org-resolver.test.ts    # NEW — every branch of FR-013
│   ├── audit-log.test.ts       # NEW — appends only non-sensitive fields
│   └── browser-open.test.ts    # NEW — command selection per platform (mocked execFile)
└── integration/
    └── auth.integration.test.ts # OPT-IN — requires real keyring; guarded by env flag; covers full round-trip on the host platform

docs/
├── authentication.md           # MODIFIED — updated for multi-org flow; `azdo auth --org ...`
└── linux-credential-store.md   # UNCHANGED
```

**Structure Decision**: Single-project layout (constitution default). New code slots into the existing `src/services/` and `src/commands/` trees. No new top-level directories.

## Complexity Tracking

Two deviations worth explicit approval:

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|-----------|-------------------------------------|
| Behaviour change: `context.ts` org resolution goes **flag → git-remote → config → error** (FR-013), whereas the existing resolution is **flag → config → git-remote → error**. | Spec FR-013 explicitly mandates the new order. Keeping two orders (one for PAT resolution, one for context) would surprise users when working inside a git repo whose remote points at a different org than `config.org`. | Would be more confusing and test surface doubles. |
| Backward-compat migration of the legacy single-slot PAT (SERVICE=`azdo-cli`, ACCOUNT=`pat`) into the new per-org keying. | Existing users have a PAT stored under the single slot today; blanket-removing it would silently break their workflows. | One-shot migration on first `auth status` / `auth logout` / first authenticated command: move to ACCOUNT=`pat:<current-org-from-config>` if `config.org` is set, otherwise log a single-line notice asking the user to run `azdo auth --org <name>` to re-store. No destructive move until the user runs one of those commands. |

Both are documented in `research.md` and surfaced in the plan-approval comment on issue #33 for explicit owner sign-off.
