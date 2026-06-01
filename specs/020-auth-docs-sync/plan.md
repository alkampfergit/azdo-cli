# Implementation Plan: Sync authentication docs

**Branch**: `020-auth-docs-sync` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/020-auth-docs-sync/spec.md`

## Summary

Bring the authentication documentation into line with the actual auth command surface implemented on `develop`. The reported problem (#41) is that the entry-point docs (`README.md`, `docs/commands.md`) predate the OAuth work (#37/#38) and only describe the PAT path, making `azdo auth login` look unsupported. Per the owner's **Option A** decision, the docs are synced to the current `develop` surface as-is (no per-release version caveat). `docs/authentication.md` is already accurate and is the source of truth; the work is correcting the stale summaries and verifying every documented command/flag against the built CLI. **Documentation only — no source changes.**

## Technical Context

**Language/Version**: N/A for this change — documentation only (the project is TypeScript 5.x / Node.js LTS / commander.js).  
**Primary Dependencies**: None added. Verification uses the existing build (`tsup`) to run the CLI's `--help` output as ground truth.  
**Storage**: N/A  
**Testing**: No automated tests added. Verification is manual/visual: build the CLI and diff documented commands/flags against `--help`; check internal links resolve. Existing `npm run lint && npm test && npm run build` must still pass (they don't cover Markdown, but must not regress).  
**Target Platform**: N/A (docs render on GitHub / npm readme).  
**Project Type**: Single-project CLI; docs live in `README.md` and `docs/`.  
**Performance Goals**: N/A  
**Constraints**: Docs-only diff (SC-005). No new CLI flags or behaviour. Cross-links must resolve (SC-004).  
**Scale/Scope**: 2 primary stale files (`README.md`, `docs/commands.md`) + verification pass over `docs/authentication.md`, `docs/oauth-app-registration.md`, and any other auth-referencing doc.

### Ground-truth auth command surface (verified on `develop`)

Captured from `node dist/index.js auth --help` and reading `src/commands/auth.ts`:

| Command | Purpose | Options |
|---|---|---|
| `azdo auth login` | Authenticate (OAuth default; `--use-pat` for PAT) | `--org`, plus inherited: `--use-pat`, `--from-stdin`, `--no-browser`, `--device-code`, `--client-id <id>`, `--tenant-id <id>`, `--scopes <s>` |
| `azdo auth` (bare) | Legacy PAT-prompt entry point (back-compat alias) | same option set as above; root action runs the PAT path |
| `azdo auth status` | Report stored credentials (kind/org/account/expiry/backend), never the token | `--org`, `--json` |
| `azdo auth logout` | Remove stored credential for an org | `--org`, `--all` |
| `azdo clear-pat` | **Deprecated** — removes a stored PAT; use `azdo auth logout` | `--org` |

**Subtlety the docs must respect:** the OAuth flags are declared on the parent `auth` command and inherited by `login` via `optsWithGlobals()`. So `azdo auth login --device-code` (etc.) works even though `azdo auth login --help` lists only `--org`. Docs should show the full `auth login` usage (as `docs/authentication.md` already does) and not be misled by the terse `login --help`.

**Release state:** the `login` command (commit `ff80f2c`, #37/PR #38) is on `develop` only; no released tag contains it (latest `0.10.1`). Per Option A, docs describe `develop` without a version caveat.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution's code principles (I CLI-First, II TypeScript Strictness, III Single-Responsibility, IV npm Distribution, V Simplicity) are **not engaged** — this change touches no source, commands, build, or dependencies.

The directly relevant clause is **Development Workflow**: *"After every completed SpecKit spec run, README.md MUST be reviewed and updated to reflect the implemented functionality, commands, options, and usage examples before merge."* This feature **is** that README/doc reconciliation — it satisfies the clause rather than violating it.

**Result: PASS, no violations.** Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/020-auth-docs-sync/
├── plan.md              # This file
├── research.md          # Phase 0 — ground-truth surface + stale-spot inventory
├── data-model.md        # Phase 1 — doc-set ↔ command-surface coverage matrix
├── quickstart.md        # Phase 1 — how to verify the docs match the CLI
├── contracts/
│   └── auth-command-surface.md   # Authoritative command/flag table docs must match
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

No source code is modified. The artifacts edited by this feature are documentation files:

```text
README.md                        # authentication summary (stale → add auth login / OAuth)
docs/
├── commands.md                  # command reference (stale → add auth login row, fix auth/status/logout)
├── authentication.md            # full guide (already accurate — verify, adjust only on drift)
├── oauth-app-registration.md    # custom Entra app registration (verify cross-links/commands)
└── linux-credential-store.md    # verify only — touch only if it names a removed/renamed command
```

**Structure Decision**: Documentation-only change. Primary edits: `README.md` and `docs/commands.md`. Verification-and-touch-on-drift: `docs/authentication.md`, `docs/oauth-app-registration.md`, and any other auth-referencing doc surfaced by a repo-wide grep.

## Complexity Tracking

No constitution violations — section intentionally empty.
