# Phase 1 — Data Model: Secure PAT Storage and `auth` Command

## Entities

### StoredCredential

Represents a single PAT persisted in the OS-native secret vault, scoped to one Azure DevOps organization.

| Attribute | Type | Source / Persistence | Notes |
|---|---|---|---|
| `org` | `string` | Derived key | The Azure DevOps organization name. Used verbatim in the keyring `ACCOUNT` field as `pat:<org>`. |
| `backend` | `'windows-credential-manager' \| 'macos-keychain' \| 'linux-libsecret'` | Derived at runtime from `process.platform` + keyring availability probe | Reported by `auth status`; logged in audit events. |
| `serviceKey` | `string` | Constant `"azdo-cli"` | Passed to `@napi-rs/keyring` `Entry` as SERVICE. |
| `accountKey` | `string` | `"pat:<org>"` | Passed to `@napi-rs/keyring` `Entry` as ACCOUNT. |
| `value` | `string` (opaque, non-persisted in tool) | OS vault only | The PAT itself. Held in memory only for the lifetime of a single CLI invocation. |
| `createdAt` / `updatedAt` | `string` (ISO 8601) | Audit log only | The OS vault does not expose timestamps; the tool derives these from its own audit log. |

**Invariants**
- The PAT value MUST NOT appear in any file managed by the tool outside the OS vault.
- `org` is required — no anonymous / default-org slot in the new scheme (legacy slot migration is one-shot; see research §6).
- Multiple `StoredCredential` records may coexist — one per org.

### AuthSession

Transient, per-invocation. Not persisted.

| Attribute | Type | Source | Notes |
|---|---|---|---|
| `org` | `string` | Output of `resolveOrg()` | The org the current command is authenticated for. |
| `pat` | `string` | `AZDO_PAT` env var (if set) OR `StoredCredential.value` (vault read) | In-memory only. |
| `source` | `'env' \| 'vault'` | Derived at lookup time | Reported in verbose logging; never persisted. |

**Invariants**
- Lifetime = single CLI process.
- Never serialised to disk in any form.

### CliConfig (existing — extended)

Non-secret preferences at `~/.azdo/config.json`. **Unchanged schema** — the `org` key already exists (spec 003). This feature uses it as the third-priority org resolution source (FR-013).

| Attribute | Type | Notes |
|---|---|---|
| `org` | `string?` | Persistent default org used when `--org` is absent and git auto-detect yields nothing. |
| `project`, `fields`, `markdown` | ... | Existing — unaffected. |

### AuditEvent (new)

Append-only JSON-lines at `~/.azdo/audit.log`. One line per event.

```jsonc
{
  "ts": "<ISO 8601 UTC>",
  "event": "auth.store" | "auth.delete" | "auth.validate.ok" | "auth.validate.fail",
  "org": "<org>",
  "backend": "windows-credential-manager" | "macos-keychain" | "linux-libsecret",
  "masked_pat": "<first5>*…*<last5>"  // only on store/delete/validate.ok
}
```

**Invariants**
- Full PAT never present.
- Append-only — never truncated by the tool.
- If `~/.azdo/` does not exist, the tool creates it with `0700` perms.
- File mode `0600` (user read/write only).

## Relationships

```
                  ┌──────────────────────┐
                  │   OS Secret Vault    │
                  │  (per platform API)  │
                  └──────────┬───────────┘
                             │ 1..N
                             │
                      ┌──────▼──────────┐       ┌─────────────────┐
                      │ StoredCredential│       │  CliConfig      │
                      │  (key: org)     │       │  (org, project) │
                      └──────┬──────────┘       └────────┬────────┘
                             │                           │
                             │ reads                     │ reads
                             │                           │
                             └───────────┬───────────────┘
                                         │
                                ┌────────▼────────┐
                                │   AuthSession   │
                                │ (per invocation)│
                                └─────────────────┘
                                         │
                                         │ writes (on store / delete / validate)
                                         ▼
                                ┌──────────────────┐
                                │   AuditEvent     │
                                │ (~/.azdo/audit.log)
                                └──────────────────┘
```

## State Transitions — StoredCredential

| From | Action | To | Side effects |
|---|---|---|---|
| absent | `azdo auth --org X`, user pastes valid PAT | present | `auth.validate.ok` + `auth.store` audit events |
| absent | `azdo auth --org X`, user pastes invalid PAT | absent (unchanged) | `auth.validate.fail` audit event |
| present | `azdo auth --org X` again | present (overwrite after confirm) | `auth.store` audit event |
| present | `azdo auth logout --org X` | absent | `auth.delete` audit event |
| legacy single-slot | first authenticated invocation AND `config.org` set | migrated to `pat:<config.org>` | `auth.store` audit event with "migrated" annotation |
