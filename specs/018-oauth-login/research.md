# Phase 0 Research: OAuth login for azdo-cli

**Branch**: `018-oauth-login`
**Date**: 2026-04-27

This document closes every open technical question raised in `plan.md`'s Technical Context. Each section follows the Decision / Rationale / Alternatives format mandated by the speckit-plan template.

## R1. Identity provider — Microsoft Entra v2.0 vs the legacy AzDO OAuth surface

**Decision**: Use **Microsoft Entra v2.0** (`https://login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize` and `.../token`) with `tenant=organizations` (or a user-specified tenant), targeting Azure DevOps as the resource via the `499b84ac-1321-427f-aa17-267ca6975798/.default` resource scope (the well-known AzDO app ID).

**Rationale**:

- Microsoft has marked the legacy AzDO OAuth surface (`https://app.vssps.visualstudio.com/oauth2/...`) as **on a deprecation path** as of 2024–2025. Microsoft documentation now points new desktop / CLI integrations at Entra.
- Entra v2.0 supports the **public client + PKCE** profile out of the box, including for desktop/CLI applications that bind a loopback redirect URI. The legacy AzDO surface required a client secret, which would directly violate FR-013a ("never embed a client secret in the released binary").
- Entra v2.0 supports the **device code flow** uniformly across tenants, satisfying FR-005 (headless path) without a second IdP code path.
- All `gh`, `az`, and `kubelogin`-style tools that talk to Microsoft cloud surfaces converge on Entra v2.0.

**Alternatives considered**:

- **Legacy AzDO OAuth surface (`app.vssps.visualstudio.com`)**: rejected. Requires a confidential client (secret) which is incompatible with FR-013a. Limited to the AzDO resource only, but that's not a benefit for us. On a deprecation path.
- **Per-tenant Entra B2B / B2C custom**: rejected. Not warranted for a CLI auth flow; adds setup cost without benefit.

## R2. OAuth flow shape — authorization code + PKCE on a loopback redirect

**Decision**: Authorization code with PKCE (`S256`), redirect URI `http://127.0.0.1:<random-high-port>/callback`. Public client (no secret). On headless hosts (auto-detected via the existing `services/browser-open.ts` heuristic, or explicit `--device-code` flag), fall back to device code flow.

**Rationale**:

- IETF BCP for OAuth in **native apps** (RFC 8252) prescribes loopback redirect + PKCE for desktop applications. Both `gh auth login` (when targeting Entra) and `az login` use this exact shape.
- PKCE removes the need for a client secret (FR-013a).
- Loopback (`127.0.0.1`) — not `localhost` — is recommended by RFC 8252 to avoid hostname-resolution edge cases and is what Entra explicitly accepts.
- Random high port satisfies the spec edge case "callback port already in use": the CLI binds an OS-assigned ephemeral port (`server.listen(0)`) and reads back the port to construct the exact redirect URI sent on `/authorize`. This guarantees the auth request and the listener match, and avoids hardcoding a port that may collide with another local service.

**Alternatives considered**:

- **Implicit flow (`response_type=token`)**: rejected. Deprecated by Entra v2.0, no refresh tokens.
- **Custom URL scheme `azdocli://callback`**: rejected. Requires per-OS handler registration on install, fragile cross-platform, doesn't work in containers or remote SSH.
- **Out-of-band copy/paste**: rejected. Extremely poor UX, plus the device code flow already covers the headless case more cleanly.

## R3. Loopback callback server — `node:http` vs a dependency

**Decision**: Use built-in `node:http` directly. Listen on `127.0.0.1:0`, accept exactly one GET on `/callback`, validate the `state` parameter against the value sent on the auth request, validate the path is exactly `/callback`, and shut down immediately after handling (or on timeout).

**Rationale**:

- Constitution V (Simplicity) and IV (npm Distribution: minimal deps) push back against pulling a server framework for a 30-line listener.
- The listener has a tightly bounded responsibility (one request, one short-lived process), so error-handling surface is small.
- Browser-side rendering of the post-auth page is plain HTML returned directly — no need for templating.

**Alternatives considered**:

- **Express / Fastify**: rejected. Multi-MB dependency for a single request listener.
- **Raw TCP / WebSocket**: rejected. Browsers redirect over HTTP; reusing HTTP is the only sane shape.

## R4. PKCE implementation — `node:crypto` from scratch

**Decision**: Implement `code_verifier` / `code_challenge` in `src/lib/pkce.ts` using `node:crypto`:

- `code_verifier`: 32 random bytes, base64url-encoded, no padding (43 chars). RFC 7636 §4.1 says 43–128 unreserved ASCII chars.
- `code_challenge`: `BASE64URL(SHA-256(code_verifier))`. RFC 7636 §4.2.
- `code_challenge_method`: `S256` always.
- `state`: 16 random bytes, base64url-encoded. Used to bind the callback to the originating session per FR-013a.

**Rationale**: ~30 LOC, no third-party dependency, fully testable.

**Alternatives considered**:

- **`pkce-challenge` package**: rejected. Adds a dependency for a single SHA-256 call.

## R5. Token endpoint exchange — native `fetch`

**Decision**: Use Node 18+ native `fetch` with `application/x-www-form-urlencoded` body to the Entra v2 token endpoint. Required form fields:

- `grant_type=authorization_code` (initial) or `grant_type=refresh_token` (refresh) or `grant_type=urn:ietf:params:oauth:grant-type:device_code` (device flow).
- `code` (auth-code flow) / `refresh_token` (refresh) / `device_code` (device flow).
- `client_id`: resolved from `oauth-config.ts` (default shipped, env override, or config override per FR-013).
- `redirect_uri`: must exactly match the value sent on `/authorize` (RFC 6749 §4.1.3); the CLI passes the same string both times.
- `code_verifier`: PKCE (auth-code flow only).
- `scope`: the resolved scope string from `oauth-config.ts` per FR-016 (mirrors PAT scope table).

Response is JSON: `access_token`, `expires_in`, `refresh_token` (sometimes), `token_type` (`Bearer`), `scope`.

**Rationale**: native, no dependency, modern API, already in use elsewhere in the repo (per AGENTS.md "native fetch").

**Alternatives considered**:

- **Adopt `openid-client` package**: rejected. Adds a heavy dependency for what is, in the public-client + PKCE case, a half-page of code.

## R6. Scope string — exact mirroring of FR-008 PAT table

**Decision**: Initial OAuth scope set, mirroring the FR-008 PAT scope table:

- `499b84ac-1321-427f-aa17-267ca6975798/vso.work` (Work Items read)
- `499b84ac-1321-427f-aa17-267ca6975798/vso.work_write` (Work Items write)
- `499b84ac-1321-427f-aa17-267ca6975798/vso.code` (Code read, sufficient for PR read per FR-008)
- `offline_access` (required by Entra to issue a refresh token; without it, refresh tokens are not returned)
- `openid` (required by Entra for ID token issuance)

**Rationale**:

- The first three map 1:1 to the FR-008 PAT scope table (Work Items r/w, Code read for PRs).
- `offline_access` is **required** for the silent-refresh requirement (FR-004); without it Entra returns access tokens with no refresh token.
- `openid` is required by the Entra v2.0 endpoint when requesting any v2 resource scope. Adds no new privileges.
- FR-016 mandates that any future feature scope is added to the PAT scope table FIRST and existing OAuth users re-consent — so this scope set is intentionally narrow and stable.
- Explicitly do NOT use `vso.full_access` per FR-016.

**Alternatives considered**:

- **`.default` scope (request all consented permissions for the AzDO app)**: rejected. Couples the user's consent dialog to the project-app's full registered permission list, which would silently widen if the registration ever adds a permission. FR-016 forbids that.

## R7. Device code flow — endpoint, polling cadence, and UX

**Decision**: Use the Entra v2.0 device code endpoints:

- `POST https://login.microsoftonline.com/<tenant>/oauth2/v2.0/devicecode` with `client_id`, `scope`. Returns `{user_code, device_code, verification_uri, expires_in, interval}`.
- Print `user_code` and `verification_uri` to stderr.
- Poll the token endpoint with `grant_type=urn:ietf:params:oauth:grant-type:device_code` every `interval` seconds until the response is no longer `authorization_pending`. Honor `slow_down` responses by extending the interval per RFC 8628 §3.5.

**Rationale**: Documented Entra surface, identical token-endpoint code path with just a different `grant_type` (so most of `oauth-flow.ts` is reused).

**Alternatives considered**:

- **Manual copy-paste of an authorization URL**: rejected — already covered above (R2 alternatives). Worse UX, no polling.

## R8. Headless / `--device-code` selection heuristic

**Decision**: Reuse the existing `services/browser-open.ts` `isHeadless()` heuristic — Linux + no `DISPLAY`. On any host the `--device-code` flag forces device-code regardless of detection. On Windows / macOS we never auto-fall-back; if the OS reports a missing browser the user gets a clear error pointing at `--device-code`.

**Rationale**: Behavioural consistency with the existing browser-open path; no new platform-detection logic to maintain.

**Alternatives considered**:

- **Try-and-fallback (open browser, fail, fall back)**: rejected. The browser-open call returns immediately on most platforms even if no browser actually opens (it spawns the OS handler), so a "did the user complete it" timeout is the only signal — and that's already the device-code experience. Adds confusion without benefit.

## R9. Stored credential envelope — JSON in the existing keyring entry

**Decision**: The keyring value for service `azdo-cli` account `pat:<org>` (existing) becomes a JSON string:

```json
{
  "kind": "oauth",
  "accessToken": "<opaque>",
  "refreshToken": "<opaque|null>",
  "expiresAt": 1745783999,
  "accountId": "<oid|email>",
  "scope": "vso.work vso.work_write vso.code offline_access openid",
  "issuedAt": 1745780399,
  "tenantId": "<guid>"
}
```

For PAT entries the envelope is `{ "kind": "pat", "token": "<pat>" }`. Reading a non-JSON entry (legacy bare PAT) is treated as `{ kind: 'pat', token: <raw> }` per the migration rule in `plan.md`.

**Rationale**:

- Reuses the existing `service:azdo-cli, account:pat:<org>` slot — no new keyring entries to manage, no new accounts to clean up on logout.
- A discriminated union on `kind` makes the credential type explicit at the type system level (Constitution II).
- The `expiresAt` field lets the refresh logic decide without a probe call.

**Alternatives considered**:

- **Separate keyring entries per kind (`oauth:<org>`, `pat:<org>`)**: rejected. Doubles the cleanup surface (logout has to delete N entries), and forces awkward "which one wins" precedence rules.
- **Store only the access token, derive expiry from a probe call**: rejected. Adds an unnecessary AzDO API hit at the start of every command and breaks SC-004's 5-second silent-refresh budget under network jitter.

## R10. Audit-log event vocabulary

**Decision**: Extend `services/audit-log.ts` with new event kinds, all written as the existing JSON-lines format (no schema change):

- `oauth-login-started` — fields: `org`, `flow` (`auth-code` | `device-code`), `clientIdSource` (`default` | `env` | `config`).
- `oauth-login-success` — fields: `org`, `flow`, `accountId`, `scope`, `tokenLifetimeSec`.
- `oauth-login-failed` — fields: `org`, `flow`, `reason` (enum: `user-cancelled` | `port-conflict` | `state-mismatch` | `redirect-mismatch` | `idp-error` | `timeout`).
- `oauth-refresh-success` — fields: `org`, `accountId`, `tokenLifetimeSec`.
- `oauth-refresh-failed` — fields: `org`, `accountId`, `reason` (enum: `revoked` | `window-exceeded` | `invalid-grant` | `network` | `unknown`).
- `oauth-logout` — fields: `org`, `accountId`.

The audit log MUST NEVER record token / refresh-token values (existing `audit-log.ts` rule).

**Rationale**: Mirrors the existing PAT audit vocabulary so users debugging "what happened" have a single source. Schema (JSON-lines) is unchanged so the existing log reader keeps working.

**Alternatives considered**: none worth listing — the existing audit pattern is the right one.

## R11. Default `client_id` source — build-time injection vs runtime constant

**Decision**: A TypeScript constant `DEFAULT_OAUTH_CLIENT_ID` in `src/services/oauth-config.ts`, set to the GUID of the project-owned Entra app registration (to be created per FR-015 by the maintainer). The constant is shipped in the bundled `dist/index.js` exactly as a public client id (see FR-013a).

**Rationale**: Simpler than a build-time `tsup` define; the value is non-secret by design. The exact GUID is not in this research doc — it will be filled in during implementation once the maintainer registers the app following the FR-015 guide.

**Alternatives considered**:

- **`tsup --define`**: rejected. Unnecessary indirection for a non-secret literal.
- **Read from a well-known config file at runtime**: rejected. Defeats the "Just Works" out-of-the-box default.

## R12. Override surface — env var name and config key

**Decision**:

- Environment variable: `AZDO_OAUTH_CLIENT_ID` overrides the default. Optional `AZDO_OAUTH_TENANT_ID` overrides the default tenant (`organizations`) for users on locked-down tenants.
- Config file (existing `~/.azdo/config.json`) keys: `oauth.clientId`, `oauth.tenantId`. Env var wins if both are set.

**Rationale**: Mirrors the existing config-file pattern (`services/config-store.ts`); env var wins so CI / scripted overrides are unambiguous.

**Alternatives considered**:

- **CLI flag only (`--client-id`)**: rejected. Forces the user to retype it on every login; env / config persists across invocations.

## R13. Multi-org isolation

**Decision**: Stored credentials are keyed per-org (`pat:<org>`) — already the case for PAT (`services/credential-store.ts`). OAuth credentials use the same key shape. The auth-code flow's authorization request includes `prompt=select_account` so a user with multiple Microsoft identities can pick the right one per org.

**Rationale**: Spec's FR-009 requires per-org isolation; existing keyring shape already provides it; only the value envelope changes (R9).

**Alternatives considered**:

- **Single global credential**: rejected, contradicts FR-009.

## R14. Browser handoff — "what does the user see in the browser tab?"

**Decision**: The loopback handler responds to the successful callback with a minimal HTML page rendered inline in `oauth-flow.ts`: heading "Login complete — you can close this tab", short body, no scripts, no external assets. On error (state mismatch, etc.) a similar page with the error reason.

**Rationale**: Self-contained, no dependency, works offline, no leakage of token material into the browser tab.

**Alternatives considered**:

- **Redirect to a hosted "you're logged in" page**: rejected. Adds an infrastructure dependency the project doesn't own.

## NEEDS CLARIFICATION resolution

Phase 0 explicitly aimed to close every NEEDS CLARIFICATION item. The Phase-3 (`/speckit-clarify`) round resolved FR-012, FR-013, FR-014 and added FR-015, FR-016 with owner consent. **No NEEDS CLARIFICATION markers remain in `spec.md` going into Phase 1.**
