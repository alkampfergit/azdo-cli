# PR Report: OAuth login for azdo-cli

**Branch**: `018-oauth-login`
**Date**: 2026-04-28
**Spec**: [specs/018-oauth-login/spec.md](spec.md)

## Summary

Adds an OAuth-based browser login to `azdo auth login` so a new user can authorise the CLI against an Azure DevOps organisation without minting a Personal Access Token in the AzDO web UI. OAuth is now the default; PAT remains a first-class option via `--use-pat`. A device-code-style fallback covers headless hosts (CI runners, dev containers, remote SSH), and a markdown guide ships in-repo explaining how to register the AzDO OAuth application end-to-end for both the project maintainer and end users on locked-down tenants.

## What's New

- **`azdo auth login` subcommand**: OAuth-default login flow against Microsoft Entra v2 + PKCE on a loopback callback (RFC 8252 + RFC 7636). Auto-detects org from the `origin` git remote when `--org` is omitted. `--use-pat` / `--from-stdin` route to the existing PAT path; `--device-code` forces the headless flow; `--client-id` / `--tenant-id` / `--scopes` override the project-shipped defaults for users on locked-down tenants. Mutual-exclusion exits (code 2) for `--use-pat` + `--device-code` and `--use-pat` + OAuth-only flags.
- **OAuth services** (`src/services/oauth-config.ts`, `oauth-flow.ts`, `oauth-token-refresh.ts`, `oauth-device-code.ts`, `src/lib/pkce.ts`, `src/types/oauth.ts`): kind-aware credential resolution (FR-007a), shipped-default + env / config / flag override precedence for `client_id` and `tenant_id`, FR-016 baseline scopes (`vso.work`, `vso.work_write`, `vso.code`, plus `offline_access` and `openid` — never `vso.full_access` by default), strict loopback-only redirect-URI validation, single-flight silent refresh with cross-process file lock at `~/.azdo/.locks/<org>.refresh`, and FR-014 hard rule (refresh failure NEVER deletes the stored credential).
- **Kind-aware credential envelope** (`src/services/credential-store.ts`, `src/types/credential.ts`): keyring value upgraded from a bare PAT string to a JSON envelope `{ kind: 'pat' | 'oauth', ... }`. Read path tolerates legacy bare-PAT entries indefinitely as `{ kind: 'pat' }` without rewriting on read (FR-007 hard rule); rewrite-as-envelope happens only on explicit re-store. Unknown kinds throw `CredentialStoreUnavailableError`.
- **Read-side dispatch** (`src/services/azdo-client.ts`, `pr-client.ts`, all 11 command files): `authHeaders` is now kind-aware — OAuth tokens produce `Authorization: Bearer …` and PATs produce `Authorization: Basic base64(:<token>)`. Internal `pat: string` parameters became `cred: AuthCredential`; commands pass the full credential object end-to-end.
- **Audit-log R10 vocabulary** (`src/services/audit-log.ts`, `src/types/audit.ts`): six new event kinds (`oauth-login-started` / `-success` / `-failed`, `oauth-refresh-success` / `-failed`, `oauth-logout`) with typed `flow` / `clientIdSource` / `accountId` / `scope` / `tokenLifetimeSec` / `reason` fields. Defence-in-depth strips `token` / `accessToken` / `refreshToken` / `pat` fields before write.
- **`docs/oauth-app-registration.md`** (FR-015): two-audience guide — §1 maintainer setup (registers the project's shared multi-tenant Entra public-client app, produces the GUID that replaces `__SHIPPED_CLIENT_ID__` in `oauth-config.ts`); §2 end-user setup (single-tenant app for locked-down tenants, override path via `AZDO_OAUTH_CLIENT_ID` env or `--client-id`). Includes the canonical PAT scope table (FR-008/FR-016 single source of truth) and a tenant-policy gotcha table covering common AADSTS errors.
- **`docs/authentication.md`** rewritten to reflect OAuth-default flow, kind-aware credential resolution, silent refresh behaviour, multi-org isolation invariants, and the new audit vocabulary.

## New Libraries / Dependencies

**None.** Constitution V (Simplicity) + IV (npm Distribution) are honoured — the OAuth flow uses only Node built-ins (`node:crypto` for PKCE / state, `node:http` for the loopback callback server, native `fetch` for the Entra v2 token endpoint). The keyring binding (`@napi-rs/keyring`) and command framework (`commander`) were already present.

## Breaking Changes

- **`azdo auth login` (NEW subcommand) defaults to OAuth.** Pass `--use-pat` for the legacy PAT prompt path. The historical entry point `azdo auth --org <name>` (root, no subcommand) preserves the legacy PAT-prompt behaviour for back-compat — any existing scripts continue to work unchanged.
- **Stored credential format change.** New OAuth + new PAT logins write a JSON envelope to the keyring instead of a bare PAT string. Read path remains backwards-compatible: pre-feature bare-PAT entries are tolerated indefinitely as `{ kind: 'pat' }` and are NOT auto-rewritten — only an explicit re-store via `azdo auth login --use-pat` migrates the entry. Existing PAT users see no behavioural change unless they choose to re-login.

## Testing

- **Unit (Vitest)** — 536 passing. New coverage in this PR:
  - `tests/unit/pkce.test.ts` — RFC 7636 verifier / challenge / S256 method, randomness sanity (1000 distinct), input validation.
  - `tests/unit/oauth-config.test.ts` — flag > env > config > default precedence for `client_id` and `tenant_id`, FR-016 baseline scope list (no `vso.full_access`), Entra v2 endpoint derivation, strict loopback redirect-URI validation.
  - `tests/unit/oauth-flow.callback.test.ts` — PKCE + state in authorization URL; `id_token` claim decoder; TokenResponse → StoredOAuthCredential mapping; loopback listener OS-assigned port + path-mismatch / state-mismatch / happy-path resolutions.
  - `tests/unit/oauth-token-refresh.test.ts` — skip when valid; single-flight (one network call across two concurrent refreshes); FR-014 network failure leaves credential intact; Entra error-code → reason translation.
  - `tests/unit/oauth-device-code.test.ts` — request shape, polling cadence, `slow_down` +5s extension per RFC 8628 §3.5, `expired_token` from IdP and from local clock, `access_denied`, end-to-end runDeviceCodeFlow with writePrompt sink.
  - `tests/unit/credential-store.kind-envelope.test.ts` — round-trip PAT and OAuth envelopes; legacy bare-PAT read tolerance; rewrite-as-envelope only on explicit re-store; unknown-kind rejection; 24h-lifetime sanity bound.
  - `tests/unit/audit-log.oauth-events.test.ts` — round-trip every R10 event kind; defence-in-depth strips token / accessToken / refreshToken / pat fields before write.
  - `tests/unit/auth-pat-regression.test.ts` — legacy bare-PAT keyring entries continue to authenticate (FR-007 hard rule); AZDO_PAT env wins over stored (FR-007a precedence); new PAT stores wrap in JSON envelope; wrapped envelope reads identically to legacy path.
  - `tests/unit/scope-table-parity.test.ts` — FR-016 single-source-of-truth invariant: docs/oauth-app-registration.md PAT scope table mentions vso.work / vso.work_write / vso.code; OAuth defaultScopes() includes those three prefixed with the AzDO resource id; offline_access + openid present; vso.full_access never in defaults; doc explicitly documents the no-vso.full_access policy.
  - `tests/unit/auth-multi-org-isolation.test.ts` — credentials for orgA + orgB do not leak into a query for unauthenticated orgC; requirePat throws CredentialMissingError for unknown orgs; logout per-org does not affect other orgs; PAT and OAuth credentials coexist as first-class across orgs (FR-007).
  - `tests/unit/auth-command.test.ts` — `azdo auth login` subcommand routing (default OAuth, `--use-pat`, `--device-code`, `--client-id` / `--tenant-id` / `--scopes` overrides), mutual-exclusion exits, git-remote auto-detect for org.
- **Manual** — quickstart §1 (browser-based OAuth login on a host with a browser) and §2 (device-code flow on a headless host) exercised against a fake AzDO IdP (token endpoint stub) — validated end-to-end including silent refresh, audit-log entries, and OAuth credential round-trip through the keyring envelope.
- **Out of scope for this PR (deferred to follow-ups):**
  - `tests/integration/oauth-loopback-roundtrip.test.ts` (T015) — full integration test with a fake AzDO IdP, real `node:http` loopback, and real `@napi-rs/keyring`. The unit tests cover the components individually; a full-stack integration test pinning the wire-level shape against the fake IdP is a follow-up.
  - Manual SC-001 (< 2 min) and SC-004 (< 5 s silent refresh) timing measurements.
  - T048 — maintainer registers the project-owned Entra app and replaces the `__SHIPPED_CLIENT_ID__` placeholder with the real GUID. Release-time gate, not merge-time gate. The override path (`AZDO_OAUTH_CLIENT_ID` / `--client-id`) works without it.

## Notes

- `DEFAULT_OAUTH_CLIENT_ID` is the literal string `'__SHIPPED_CLIENT_ID__'` in `src/services/oauth-config.ts` until the maintainer follows [`docs/oauth-app-registration.md`](../../docs/oauth-app-registration.md) §1 and pastes in the real GUID. OAuth flows targeting the default app will fail at the IdP with that placeholder; the override path (`AZDO_OAUTH_CLIENT_ID` env / `--client-id` flag) works without it.
- The shared `client_id` is intentionally non-secret per OAuth public-client convention (FR-013a). Security comes from PKCE on every authorisation, strict loopback-only redirect URI validation, the OAuth `state` binding, and least-privilege scopes (FR-016).
- Read-side commands transparently use OAuth tokens as `Authorization: Bearer …` and PATs as `Authorization: Basic …`. Commands written before this feature receive the full `AuthCredential` object now; if any custom external caller relies on the old `pat: string` parameter type for `pr-client.ts` or `azdo-client.ts` functions, they need to migrate to passing the credential object — a one-line change.
- This PR merges into `develop` (gitflow integration branch). Tagging / releasing is owner-driven via a separate `release/*` flow per the project's gitflow rule — out of scope here.
