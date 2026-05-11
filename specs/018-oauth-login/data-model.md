# Phase 1 Data Model: OAuth login for azdo-cli

**Branch**: `018-oauth-login`
**Date**: 2026-04-27

This document captures the data shapes the feature introduces or modifies. The CLI persists at most a few small JSON envelopes per organisation in the OS credential store plus a metadata audit trail; no database, no schema migrations beyond the credential-envelope shape change in `services/credential-store.ts`.

## E1. StoredCredential — the keyring envelope

Persisted location: OS credential store via `@napi-rs/keyring`, service `azdo-cli`, account `pat:<org>` (existing slot).

The persisted **value** is a UTF-8 JSON string. The TypeScript type is a discriminated union:

```ts
// src/types/credential.ts (updated)
export type StoredCredential = StoredPatCredential | StoredOAuthCredential;

export interface StoredPatCredential {
  kind: 'pat';
  token: string;          // the PAT itself (existing semantics)
}

export interface StoredOAuthCredential {
  kind: 'oauth';
  accessToken: string;
  refreshToken: string | null;  // null if Entra did not issue one (no offline_access)
  expiresAt: number;            // Unix epoch seconds (UTC)
  issuedAt: number;             // Unix epoch seconds (UTC)
  accountId: string;            // Entra OID or UPN — used for display + audit, never as a secret
  scope: string;                // space-separated scope string actually granted by the IdP
  tenantId: string;             // resolved Entra tenant id used at login time
}
```

### Validation rules (write path)

- `kind` MUST be `'pat'` or `'oauth'`. No other value is ever written.
- For `kind: 'oauth'`:
  - `accessToken` MUST be a non-empty string.
  - `expiresAt > issuedAt` MUST hold.
  - `expiresAt - issuedAt <= 24 * 3600` (sanity check — Entra access tokens are normally ≤ 90 minutes; reject anything pretending to be longer than 24h to catch IdP misconfigurations).
  - `scope` MUST contain at least one of the FR-016 baseline scopes.
- For `kind: 'pat'`: `token` MUST be non-empty after the existing `normalizePat()` step.

### Validation rules (read path)

- A non-JSON or JSON-without-`kind` value is **interpreted as legacy `kind: 'pat'`** (migration rule — see `plan.md`).
- A JSON value with an unknown `kind` is rejected with `CredentialStoreUnavailableError` and logged once to audit (`unknown-kind`).

### Lifecycle / state transitions

```text
                    ┌──────────────┐
                    │   absent     │
                    └──────┬───────┘
                           │ azdo login (default OAuth)
                           ▼
                    ┌──────────────┐    refresh succeeds
   ┌────────────────┤  oauth-fresh │◄────────┐
   │ azdo logout    └──────┬───────┘         │
   │                       │ access-token    │
   │                       │ expires         │
   │                       ▼                 │
   │                ┌──────────────┐ refresh │
   │                │ oauth-stale  │─────────┘
   │                └──────┬───────┘
   │                       │ refresh fails (FR-014)
   │                       ▼
   │                ┌──────────────┐  azdo login
   │                │ oauth-dead   │─────────────► oauth-fresh
   │                │ (kept on disk│
   │                │  per FR-014) │
   │                └──────────────┘
   ▼
absent (entry deleted)

                    ┌──────────────┐
                    │   absent     │
                    └──────┬───────┘
                           │ azdo login --use-pat
                           ▼
                    ┌──────────────┐
                    │  pat         │ ─── (no expiry, no refresh) ──┐
                    └──────┬───────┘                                │
                           │ azdo logout                            │
                           ▼                                        │
                       absent ◄────────────────────────────────────┘
```

Notes on the state machine:

- The `oauth-dead` state is the FR-014 outcome: refresh has failed for a non-network reason; the credential record stays on disk so the user can inspect it; the next CLI command surfaces a clear "run `azdo login --org <O>`" error.
- `oauth-stale → oauth-fresh` is the silent-refresh path (FR-004), happens during the next authenticated command, no user interaction.
- Transitions never delete a credential automatically (FR-014 hard rule).

## E2. OrgContext — the per-command resolution input

This is not a persisted entity; it's the in-process record that decides which `StoredCredential` to attach to an outbound AzDO API call.

```ts
// src/services/org-resolver.ts (existing — no shape change for this feature)
export interface OrgContext {
  org: string;             // e.g. "contoso"
  source: 'flag' | 'config' | 'env' | 'default';
}
```

### Resolution rules at command-execution time (FR-007a)

1. Read `process.env.AZDO_PAT` — if set, use as a `kind: 'pat'` credential transient (NOT persisted).
2. Otherwise, look up `StoredCredential` for `OrgContext.org` in the OS credential store via `services/credential-store.ts`.
3. If found and `kind: 'oauth'`:
   - If `expiresAt - now > 60` → use `accessToken` directly.
   - Otherwise → enter the refresh path (`oauth-token-refresh.ts`).
4. If found and `kind: 'pat'` → use `token` directly.
5. If absent → fail with FR-009 message: "log in to `<org>` with `azdo login`".

The 60-second margin in step 3 is the clock-skew tolerance (Edge Case in spec).

## E3. AuthorizationSession — the in-flight OAuth login attempt

Lives only in-process for the duration of a single `azdo login` invocation. Never persisted, never written to disk.

```ts
// src/types/oauth.ts (new)
export interface AuthorizationSession {
  flow: 'auth-code' | 'device-code';
  org: string;
  state: string;            // 16-byte random base64url, FR-013a state binding
  codeVerifier: string;     // 32-byte random base64url, RFC 7636
  codeChallenge: string;    // SHA-256(codeVerifier), base64url no-pad
  redirectUri: string;      // exact "http://127.0.0.1:<port>/callback" string sent to /authorize
  clientId: string;
  tenantId: string;
  scope: string;            // space-separated scope string
  startedAt: number;        // Unix epoch seconds
  timeoutAt: number;        // startedAt + 5 min for auth-code, + endpoint-supplied "expires_in" for device-code
  // Auth-code flow only:
  callbackPort?: number;    // OS-assigned port the loopback server is listening on
  // Device-code flow only:
  deviceCode?: string;
  userCode?: string;
  verificationUri?: string;
  pollIntervalSec?: number;
}
```

### Validation rules

- `state` and `codeVerifier` MUST be cryptographically random per `node:crypto`'s `randomBytes`.
- `redirectUri` MUST be `^http://127\.0\.0\.1:\d+/callback$` — no other host, no other path, no HTTPS (loopback exception per RFC 8252).
- `scope` MUST start with the FR-016 baseline (verified at construction time).
- `timeoutAt` MUST be > `startedAt`. Defaults: 300s for auth-code, IdP-supplied `expires_in` for device-code.

### Discarded after

- A successful token exchange (the resulting `StoredOAuthCredential` is what's persisted; the session data is GC'd).
- A failed exchange (any session state never lands on disk).
- A timeout.

## E4. RefreshOperation — the in-process single-flight ledger

Not persisted. In-memory map keyed by `org` plus a per-org `~/.azdo/.locks/<org>.refresh` lock file (cross-process lock; see `plan.md` Concurrency).

```ts
// src/services/oauth-token-refresh.ts (new)
type RefreshOperation = {
  org: string;
  startedAt: number;
  promise: Promise<StoredOAuthCredential>;  // single-flight in this process
};
```

The lock-file presence is the cross-process signal; the `promise` map dedups within one Node process.

## E5. AuditEvent — JSON-lines schema (no change)

The existing `services/audit-log.ts` JSON-lines schema is reused. Each line is a JSON object with at minimum `{ ts, kind, ...fields }`. The new `kind` values are listed in `research.md` R10.

The schema is intentionally additive: existing audit-log readers keep working without modification; only the set of `kind` values grows.

## Relationships

```text
OrgContext.org  ──────────►  StoredCredential (per-org, in OS keyring)
                                      │
                                      │ (oauth only)
                                      ▼
                              uses → AuthorizationSession (transient, per login)
                                      │
                                      │ (silent refresh)
                                      ▼
                              uses → RefreshOperation (transient, per refresh)

Every transition writes one or more AuditEvent JSON-lines.
```

There are no foreign keys, no joins. The whole model is small by design.
