# Contract — `credential-store` service

Public surface of `src/services/credential-store.ts` after this feature.

## Types

```ts
export type Backend =
  | 'windows-credential-manager'
  | 'macos-keychain'
  | 'linux-libsecret';

export interface StoredCredentialMeta {
  org: string;
  backend: Backend;
}

export class CredentialStoreUnavailableError extends Error {
  readonly backend: string; // diagnostic only
}
```

## Functions

### `async getPat(org: string): Promise<string | null>`

Reads the stored PAT for `org`.

- Returns the PAT value if present.
- Returns `null` if no entry exists for `org`.
- Throws `CredentialStoreUnavailableError` if the OS vault is not reachable (FR-010) — never returns `null` in that case.

Legacy migration: if `org` matches the single-slot legacy entry's inferred org (see research §6), performs a one-shot move to `pat:<org>` and returns the migrated value.

### `async storePat(org: string, pat: string): Promise<void>`

Writes `pat` under `pat:<org>`.

- Overwrites any existing value for that org.
- Appends an `auth.store` audit event.
- Throws `CredentialStoreUnavailableError` if the backend is unavailable.

### `async deletePat(org: string): Promise<boolean>`

Removes the stored PAT for `org`.

- Returns `true` if an entry was present and removed.
- Returns `false` if no entry existed.
- Appends an `auth.delete` audit event on removal.
- Throws `CredentialStoreUnavailableError` if the backend is unavailable.

### `async listOrgsWithStoredPat(): Promise<string[]>`

Enumerates orgs with a stored PAT. Implementation uses the audit log as the source of truth for enumeration (keyring APIs don't reliably enumerate on all platforms). Returns an array of org names sorted lex-asc. Empty array if none.

### `async probeBackend(): Promise<Backend>`

Returns the active backend identifier. Throws `CredentialStoreUnavailableError` if none is available.

## Backward compatibility

The no-arg forms `getPat()` / `storePat(pat)` / `deletePat()` are REMOVED. Existing call sites in commands (`list-fields`, `assign`, `upsert`, `pr`, `get-item`, `download-attachment`, `comments`, `set-state`) migrate via the refactor in `src/services/auth.ts::resolvePat(org)`.

The `clear-pat` command calls `deletePat(resolvedOrg)`.
