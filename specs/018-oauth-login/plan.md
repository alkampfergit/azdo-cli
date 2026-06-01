# Implementation Plan: OAuth login for azdo-cli

**Branch**: `018-oauth-login` | **Date**: 2026-04-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/018-oauth-login/spec.md`

## Summary

Add an OAuth-based `azdo login` flow alongside the existing PAT path. The default flow opens the user's browser to Microsoft Entra's `/authorize` endpoint with PKCE, listens on a loopback port for the callback, exchanges the code for an access + refresh token, and persists the credential in the OS credential store (Windows Credential Manager / macOS Keychain / Linux Secret Service) using the existing `@napi-rs/keyring` wrapper at per-org granularity. A device-code-style fallback is auto-selected on headless hosts. PAT remains a first-class option via `--use-pat`. A markdown guide ships in the repo explaining how to register the AzDO OAuth application end-to-end.

The implementation is structured as a thin OAuth flow layer on top of the existing auth/credential/audit/browser infrastructure — no new dependencies are required for the OAuth flow itself (PKCE = `node:crypto`, callback server = `node:http`, browser = existing `services/browser-open.ts`, storage = existing `services/credential-store.ts` extended to record credential kind).

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode) on Node.js LTS (≥18, native `fetch`)
**Primary Dependencies**: `commander` (CLI, existing), `@napi-rs/keyring` (credential store, existing), `node:http` (loopback callback, built-in), `node:crypto` (PKCE + state, built-in), native `fetch` (token exchange, built-in)
**New runtime dependencies**: **none** — OAuth flow uses only built-ins; this matches Constitution principle V (Simplicity) and IV (npm Distribution: minimal deps)
**Storage**: per-org records in OS credential store via `@napi-rs/keyring` (existing `services/credential-store.ts`); the stored value is JSON `{ kind: 'pat' | 'oauth', token, refreshToken?, expiresAt?, accountId?, scope?, issuedAt }`. Existing PAT entries (`pat:<org>` account) MUST be readable as `kind: 'pat'` for backwards compatibility — see Migration below.
**Testing**: Vitest (existing) — unit tests under `tests/unit/`, integration under `tests/integration/`. CI keyring is provisioned by `scripts/setup-keyring.sh` per existing convention.
**Target Platform**: Win/Mac/Linux desktop CLI; CI runners (headless) covered by device-code fallback.
**Project Type**: CLI (single project — `src/` + `tests/`).
**Performance Goals**: silent refresh + AzDO API call returns in < 5s for 95th percentile (SC-004); browser-launch flow start to credential persisted in < 2 minutes for new user (SC-001). Both dominated by user/network, not CLI overhead.
**Constraints**:
- No client secret in the binary (FR-013a, Constitution V).
- Credentials never written in plaintext to disk (FR-003); `~/.azdo/audit.log` may record metadata events but never the secret material (existing pattern in `services/audit-log.ts`).
- Cross-platform without platform-specific code paths beyond what `browser-open.ts` and `credential-store.ts` already encapsulate.
**Scale/Scope**: a single end-user authenticating against 1–N AzDO organisations. Concurrent CLI processes during refresh handled via single-flight (see Concurrency below). No multi-tenant server concerns.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Pre-research check | Post-design re-check |
| --- | --- | --- |
| **I. CLI-First Design** | OAuth surface is exposed as the existing `azdo login` command. Adds `--use-pat` (already specified in FR-007), `--device-code` (headless override per FR-005), `--client-id` and `--scopes` (override hooks for FR-013 / FR-016). Output goes to stderr (status), exit codes meaningful. Compliant. | Compliant — see contract/auth-service.md and the updated `commands/auth.ts` shape in Phase 1. |
| **II. TypeScript Strictness** | All new modules will declare explicit types; the JSON shape persisted in keyring is typed via a discriminated union in `types/credential.ts`. No `any`. Compliant. | Compliant. |
| **III. Single Responsibility Commands** | The auth command stays focused on authentication. The OAuth flow logic lives in `services/oauth-flow.ts` (auth-code+PKCE), `services/oauth-device-code.ts` (device flow), `services/oauth-token-store.ts` (kind-aware credential persistence delegating to existing credential-store). `azdo login` orchestrates, services do the work. Compliant. | Compliant. |
| **IV. npm Distribution** | Zero new runtime dependencies (built-ins only). `tsup` bundle continues to produce a single `dist/index.js`. `package.json` `bin` unchanged. Compliant. | Compliant. |
| **V. Simplicity** | Use built-in `node:http` + `node:crypto` rather than pulling an OAuth library. Mirror existing `services/browser-open.ts` headless detection rather than re-implementing it. Use the existing audit-log pattern. No abstractions beyond what each FR requires. Compliant. | Compliant — Phase 1 design did not introduce any wrapper layers; the auth-service contract is the single seam. |

**Gate result (pre-research): PASS — no violations to justify in Complexity Tracking.**

**Gate result (post-design): PASS — no violations introduced.**

## Project Structure

### Documentation (this feature)

```text
specs/018-oauth-login/
├── plan.md              # This file
├── research.md          # Phase 0 — OAuth flow choices, AzDO endpoints, PKCE, callback server
├── data-model.md        # Phase 1 — StoredCredential, OrgContext, AuthorizationSession entities
├── contracts/
│   ├── auth-service.md  # Internal contract: AuthService interface (login, refreshIfNeeded, logout, status)
│   └── cli-surface.md   # Internal contract: azdo login / logout / status flag set
├── quickstart.md        # Phase 1 — manual + automated validation walkthroughs
└── tasks.md             # Phase 2 — produced by /speckit-tasks
```

### Source Code (repository root)

The existing repo layout is preserved; OAuth additions slot into the existing services and command files.

```text
src/
├── commands/
│   ├── auth.ts                  # Updated: orchestrates OAuth (default) or PAT (--use-pat) login;
│   │                            # adds --device-code, --client-id, --scopes flags; logout, status
│   └── (others unchanged)
├── services/
│   ├── auth.ts                  # Updated: routes login() to OAuth or PAT path; existing PAT helpers stay
│   ├── credential-store.ts      # Updated: stores JSON envelope { kind, token, ... } per org; reads
│   │                            # legacy bare-PAT entries as { kind: 'pat' } for backwards compat
│   ├── oauth-flow.ts            # NEW: PKCE + state + loopback callback authorization-code flow
│   ├── oauth-device-code.ts     # NEW: device-code flow (headless / --device-code)
│   ├── oauth-token-refresh.ts   # NEW: refresh-with-single-flight logic; surfaces refresh failures per FR-014
│   ├── oauth-config.ts          # NEW: resolves client_id (default shipped or override env var/config),
│   │                            # redirect URI policy (loopback only), scope set (mirrors PAT table)
│   ├── audit-log.ts             # Updated: new event kinds — oauth-login-started, oauth-login-success,
│   │                            # oauth-refresh-success, oauth-refresh-failed, oauth-logout
│   └── browser-open.ts          # No change — already handles cross-platform + headless detection
├── types/
│   ├── credential.ts            # Updated: discriminated union { kind: 'pat' | 'oauth', ... }
│   └── oauth.ts                 # NEW: PkceParams, AuthorizationRequest, TokenResponse, etc.
├── lib/
│   └── pkce.ts                  # NEW: code_verifier / code_challenge helpers (node:crypto only)
└── version.ts

tests/
├── unit/
│   ├── pkce.test.ts                          # NEW
│   ├── oauth-flow.callback-validation.test.ts # NEW — state binding, redirect URI exact match
│   ├── oauth-token-refresh.test.ts            # NEW — single-flight, surface-on-failure
│   ├── oauth-config.client-id-resolution.test.ts # NEW — default / env var / config override
│   ├── credential-store.kind-envelope.test.ts # NEW — read legacy bare PAT, write/read OAuth envelope
│   └── auth-command.flag-routing.test.ts      # NEW — --use-pat vs default OAuth, --device-code
└── integration/
    ├── oauth-loopback-roundtrip.test.ts      # NEW — fake AzDO IdP, real loopback, real keyring
    └── auth-pat-still-works.test.ts          # NEW — regression: existing PAT login unaffected

docs/
└── oauth-app-registration.md                 # NEW — FR-015 markdown guide (audiences: maintainer + end users)

scripts/
└── setup-keyring.sh                          # No change — already provisions CI keyring
```

**Structure Decision**: Single-project layout (Constitution IV / V). No new top-level directories. New OAuth modules slot into the existing `src/services/`, `src/types/`, `src/lib/` shape. The OAuth registration guide goes under a new `docs/` directory because the existing README is not the right home for a multi-section walkthrough; `docs/oauth-app-registration.md` is linked from README and from the `azdo login --help` text.

## Migration & backwards compatibility

The existing `services/credential-store.ts` stores a bare PAT string under keyring service `azdo-cli` account `pat:<org>` (and a legacy `pat` account). This feature changes the stored value to a JSON envelope. Two compatibility rules apply:

1. **Read path tolerates legacy bare strings.** When `getStoredCredential(org)` reads an entry whose body is not valid JSON or has no `kind` field, it MUST treat it as `{ kind: 'pat', token: <raw> }` and continue working. No silent migration on read — only on first explicit re-write (`azdo login --use-pat`) is the entry rewritten as a JSON envelope.
2. **No automatic upgrade from PAT to OAuth.** A user with a stored PAT is NOT silently migrated to OAuth on the next command. They keep using PAT until they run `azdo login` (which now defaults to OAuth) or set the existing PAT env var (FR-007a). FR-007 explicitly forbids force-migration.

Audit-log events for the migration boundary are recorded so post-merge debugging can trace whether a user's tree mixed legacy and new entries.

## Concurrency

Two CLI processes hitting an expired access token must not corrupt the stored credential (Edge Case in spec). The chosen approach is **last-writer-wins on a successful refresh** with a fast precheck:

1. Read the credential. If access token still valid (with 60s clock-skew margin per the spec edge case), use it; no refresh needed.
2. If refresh is needed, lock a per-org file at `~/.azdo/.locks/<org>.refresh` via `node:fs` `O_CREAT | O_EXCL`. Locking process performs the refresh and writes the new credential. Other processes spin-wait up to 5s on the lock, then re-read the credential (which by then carries a fresh access token) and proceed.
3. If the lock can't be acquired and the wait expires, the second process performs its own refresh attempt independently. Refresh tokens are single-use in some IdPs but Microsoft Entra issues fresh refresh tokens with each refresh; in that case one refresh's response wins and the other's response is also written (last-writer-wins is fine because both are valid bound credentials for the same identity). If the IdP rejects the second refresh (token already exchanged), surface the standard FR-014 error.

This avoids a heavyweight cross-platform inter-process mutex; the lock file in the user's home dir is cross-platform and the worst case (race) lands on FR-014's surfaced-error path which the user already knows how to handle.

## Test strategy (high level)

| Test | Scope | Notes |
| --- | --- | --- |
| Unit: pkce | `lib/pkce.ts` | Verify SHA-256 challenge, base64url no padding, verifier randomness. |
| Unit: oauth-flow callback | `services/oauth-flow.ts` | Inject a mock HTTP server + mock browser; verify state mismatch → reject; verify redirect URI mismatch → reject; verify only loopback bound. |
| Unit: token refresh single-flight | `services/oauth-token-refresh.ts` | Two concurrent calls → one network exchange. Failure path surfaces FR-014 error and does NOT delete credential. |
| Unit: config resolution | `services/oauth-config.ts` | Default shipped client id; `AZDO_OAUTH_CLIENT_ID` env override; config-file override. Loopback-only redirect URI policy. |
| Unit: credential envelope | `services/credential-store.ts` | Round-trip OAuth envelope; read legacy bare PAT as `{kind:'pat'}`; rewrite-as-envelope only on explicit re-store. |
| Unit: command flag routing | `commands/auth.ts` | `azdo login` → OAuth path; `--use-pat` → PAT path; `--device-code` → device-code OAuth; `--client-id` overrides default. |
| Integration: loopback round-trip | end-to-end with fake AzDO IdP, real `node:http`, real `@napi-rs/keyring` (provisioned by `scripts/setup-keyring.sh`) | Confirms a full successful login flow + a follow-up authenticated API call. |
| Integration: PAT regression | end-to-end PAT path | Confirms existing PAT users see no behaviour change. |

Tests may NOT make real network calls to `login.microsoftonline.com` or `dev.azure.com`. The OAuth flow code MUST accept an injected `tokenEndpoint` / `authorizationEndpoint` so tests can target a local fake.

## Phase progression

- **Phase 0 (research)**: see `research.md`. Resolves: AzDO OAuth provider choice (Entra v2 vs legacy AzDO surface), the exact token endpoint and required form fields, scope-string format, refresh-token behaviour, device-code endpoint and polling cadence, redirect URI rules. All `NEEDS CLARIFICATION` markers are closed in `research.md`.
- **Phase 1 (design)**: see `data-model.md`, `contracts/auth-service.md`, `contracts/cli-surface.md`, `quickstart.md`. No code yet. Re-evaluates Constitution gates (PASS).
- **Phase 2 (tasks)**: produced by `/speckit-tasks`, NOT by this command.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified.

**No violations.** Section intentionally empty — the design adheres to Constitution principles I–V (CLI-first, TypeScript strictness, single responsibility, npm minimal-dep distribution, simplicity).

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | (none) | (none) |
