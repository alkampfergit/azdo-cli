# Research: Sync authentication docs

Phase 0 establishes the ground truth (the actual auth command surface) and inventories the stale spots. There were no open `NEEDS CLARIFICATION` items after the spec's Option A decision; the "research" here is empirical verification against the running CLI and the docs.

## Decision 1 — Source of truth for the auth surface

- **Decision**: Use the built CLI's `--help` output on `develop` (and `src/commands/auth.ts`) as the authoritative description; treat `docs/authentication.md` as the already-accurate prose source of truth.
- **Rationale**: The issue stems from docs drifting from code. The only reliable reference is what the code does. `docs/authentication.md` was verified to match the CLI, so it anchors the reconciliation.
- **Alternatives considered**: Trusting the existing README/commands.md (rejected — they're the stale artefacts); inferring from changelog/PRs (rejected — less reliable than the binary).

### Verified surface (build + `--help` + source)

- `azdo auth login` — OAuth default; `--use-pat`/`--from-stdin` switch to the PAT path. Inherited flags from parent `auth`: `--org`, `--use-pat`, `--from-stdin`, `--no-browser`, `--device-code`, `--client-id <id>`, `--tenant-id <id>`, `--scopes <s>`.
- `azdo auth` (bare) — legacy PAT-prompt alias (`handleAuthRoot` → `handlePatLogin`).
- `azdo auth status` — `--org`, `--json`; reports kind/org/account/expiry/backend, never the token.
- `azdo auth logout` — `--org`, `--all`.
- `azdo clear-pat` — deprecated alias of `auth logout` (`--org`).
- Mutual-exclusion rules exist (e.g. `--use-pat` + `--device-code` → exit 2), already documented in `docs/authentication.md`.

## Decision 2 — Release-state handling (Option A)

- **Decision**: Document the `develop` surface as current, with **no per-release version caveat**.
- **Rationale**: Owner chose Option A. `login` (#37, commit `ff80f2c`) is merged to `develop` but in no released tag (latest `0.10.1`); the owner's PAT-only `auth` help came from the released binary. Docs on `develop` describe `develop`; the command ships to users at the next release (out of scope here).
- **Alternatives considered**: Option B (mark login as "from next release") and Option C (cut a release first) — both declined by the owner.

## Decision 3 — Documentation gotcha to encode

- **Decision**: Docs must show the full `azdo auth login` usage (with OAuth flags), not the terse `auth login --help`.
- **Rationale**: The OAuth flags live on the parent `auth` command and are inherited by `login` via `optsWithGlobals()`. `azdo auth login --help` therefore lists only `--org`, but `azdo auth login --device-code` etc. work. A naive doc author reading only `login --help` would wrongly omit the flags. `docs/authentication.md` already gets this right.

## Stale-spot inventory (to fix / verify)

| File | Status | Action |
|---|---|---|
| `README.md` (auth summary, ~line 19) | **Stale** — only "Store a PAT … via `azdo auth`"; no `login`/OAuth | Add `azdo auth login` (OAuth default) + PAT alternative; keep link to `docs/authentication.md` |
| `docs/commands.md` (auth rows, ~18–21) | **Stale** — `azdo auth` = "Store a PAT", **no `auth login` row**, stale flags | Add `azdo auth login` row; update `auth`/`status`/`logout` descriptions to reflect OAuth+PAT; keep `clear-pat` deprecated |
| `docs/authentication.md` | **Accurate** | Verify against surface; adjust only on genuine drift |
| `docs/oauth-app-registration.md` | Likely accurate | Verify command names + cross-links resolve |
| `docs/linux-credential-store.md` | Secret-service setup, not commands | Verify only; touch only if it names a removed/renamed command |
| Repo-wide grep for `azdo auth`/`clear-pat`/`AZDO_PAT` | TBD in implement | Catch any other stale reference |

## Open risks

- A grep may surface stale auth references outside the known files (e.g. other docs, code comments). Code comments are out of scope (docs-only); other docs get the same accurate description.
- `docs/authentication.md` mentions a "default `client_id` for the project's shared OAuth application" that must be registered — this is a maintainer note, accurate, left as-is.
