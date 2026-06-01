# Contract: AuthService (internal interface)

**Branch**: `018-oauth-login`

This is the seam every other module crosses to get a usable AzDO credential. It is internal to the binary — there is no public network API for this CLI — but it is THE interface the rest of the codebase agrees on so the OAuth and PAT paths can coexist (FR-007 / FR-007a).

## Surface

```ts
// src/services/auth.ts (after Phase-2 implementation)

export interface AuthService {
  /**
   * Resolve the credential to attach to an outbound AzDO call for the given
   * organisation. Refreshes silently if the stored OAuth credential's access
   * token is expired and a refresh token is available. NEVER deletes a stored
   * credential on refresh failure (FR-014).
   *
   * @throws CredentialMissingError    — no stored credential and no PAT env var
   * @throws CredentialRefreshError    — stored OAuth credential's refresh path
   *                                     was rejected by the IdP for non-network
   *                                     reasons; carries the FR-014 message
   * @throws CredentialStoreUnavailableError — keyring backend not available
   */
  resolveCredential(org: string): Promise<UsableCredential>;

  /**
   * Drive an interactive login for the given org. Routes to OAuth (default) or
   * PAT (when `useProvider === 'pat'`). On success, persists the credential
   * via the kind-aware credential store. Emits audit events at each step.
   *
   * Posts no comments / writes no files outside the credential store and the
   * audit log.
   */
  login(org: string, opts: LoginOptions): Promise<LoginResult>;

  /**
   * Remove the stored credential for the given org (or all orgs). Never
   * affects unrelated orgs (FR-006). Emits audit events.
   */
  logout(opts: LogoutOptions): Promise<LogoutResult>;

  /**
   * Read-only summary of stored credentials suitable for `azdo auth status`.
   * Returns kind, org, and (for OAuth) account id, scope, expiry. Does NOT
   * return token material.
   */
  status(): Promise<StatusReport>;
}

export type UsableCredential =
  | { kind: 'pat'; token: string }
  | { kind: 'oauth'; bearerToken: string; accountId: string };

export interface LoginOptions {
  useProvider?: 'oauth' | 'pat';            // default: 'oauth' (FR-012)
  flow?: 'auth-code' | 'device-code' | 'auto';  // OAuth only; default 'auto' (FR-005)
  clientIdOverride?: string;                // FR-013 override path
  tenantIdOverride?: string;
  scopesOverride?: readonly string[];       // power-user (FR-016 says A; this is here for the "A is mostly the answer" override case the owner reserved)
  // PAT only: forwarded to existing prompt/stdin paths
  patFromStdin?: boolean;
  patValue?: string;
}

export interface LoginResult {
  org: string;
  kind: 'pat' | 'oauth';
  accountId?: string;       // OAuth only
  expiresAt?: number;       // OAuth only
  scope?: string;           // OAuth only
  flowUsed?: 'auth-code' | 'device-code';
}

export interface LogoutOptions {
  org?: string;             // omit to log out of every org
}

export interface LogoutResult {
  removed: { org: string; kind: 'pat' | 'oauth' }[];
}

export interface StatusReport {
  orgs: {
    org: string;
    kind: 'pat' | 'oauth';
    accountId?: string;
    expiresAt?: number;
    scope?: string;
    backend: 'windows-credential-manager' | 'macos-keychain' | 'linux-libsecret' | 'unknown';
  }[];
}
```

## Behavioural contract

### `resolveCredential(org)` — invariants

1. MUST consult `process.env.AZDO_PAT` first per FR-007a; if set, return `{kind:'pat', token}` without touching the OS keyring.
2. MUST NOT make a network call when the stored OAuth `accessToken` is still within its expiry window (60s skew margin per spec edge case).
3. MUST silently refresh exactly once when the access token is past expiry, even under concurrent invocations from the same process (single-flight per `RefreshOperation`).
4. MUST NEVER delete or overwrite the stored credential on a refresh failure (FR-014).
5. MUST emit `oauth-refresh-success` or `oauth-refresh-failed` to the audit log when a refresh attempt is made.
6. MUST surface the FR-014 message verbatim ("refresh token rejected for org `<O>`; run `azdo login --org <O>` to re-authorise") on the throw path so the CLI command can print it without re-formatting.
7. MUST NOT log token material — accessor methods on `UsableCredential` are the only readers; existing `services/auth-masking.ts` patterns apply.

### `login(org, opts)` — invariants

1. The default path (`useProvider` undefined or `'oauth'`) opens the browser per FR-001 / FR-005 detection. `--use-pat` (i.e. `useProvider: 'pat'`) routes to the existing PAT prompt code path unchanged.
2. The OAuth flow MUST use PKCE `S256` (FR-013a, R4 of `research.md`).
3. The redirect URI sent on the authorization request MUST equal the loopback URL the CLI is actually listening on (FR-013a, exact match).
4. The `state` parameter MUST be validated on the callback before exchanging the code (FR-011 / FR-013a).
5. On any error (port conflict, browser unavailable, user cancellation, IdP error), the surfaced error MUST be one of the documented edge-case messages (FR-010); never a stack trace.
6. On success, MUST write a `StoredCredential` JSON envelope (E1 in `data-model.md`) to the same keyring slot the existing PAT path uses.
7. MUST emit the audit events from R10 of `research.md`.
8. MUST NOT silently re-use a previously stored credential if `login` is re-invoked — the user explicitly asked for a fresh auth flow.

### `logout(opts)` — invariants

1. With `org` set: deletes only that org's keyring entry; other orgs untouched (FR-006).
2. With `org` omitted: enumerates orgs (existing helper), deletes each, emits one `oauth-logout` per removed entry. PATs are removed the same way.
3. On `~/.azdo/.locks/<org>.refresh` lingering from a crashed refresh attempt: best-effort delete during logout (no-op if absent).

### `status()` — invariants

1. Read-only; never mutates state.
2. Returns NO token material — only metadata.
3. Reports `kind` faithfully; legacy bare-PAT entries appear as `kind: 'pat'` per the migration rule.

## Error contract

```ts
// src/types/credential.ts (extended)

export class CredentialMissingError extends Error {
  readonly org: string;
}

export class CredentialRefreshError extends Error {
  readonly org: string;
  readonly reason: 'revoked' | 'window-exceeded' | 'invalid-grant' | 'network' | 'unknown';
  readonly userMessage: string;  // pre-formatted FR-014 sentence
}

// existing — kept
export class CredentialStoreUnavailableError extends Error {
  readonly backend: CredentialBackend;
}
```

Every public method on `AuthService` only throws one of the three above. The OAuth-flow internals translate raw `fetch` failures, IdP error responses, and PKCE / state validation failures into one of these three classes before they cross the seam.

## Compatibility

- `commands/auth.ts` is the only caller of `AuthService` for state-changing operations.
- `services/azdo-client.ts` and `services/pr-client.ts` are the read-side callers (`resolveCredential`).
- The legacy free functions in `services/auth.ts` (`promptForPat`, `validatePatAgainstAzdo`, `maskedDisplay`, `normalizePat`) are **kept** and become internal helpers used by the PAT branch of `login()`. No public re-shuffling.
