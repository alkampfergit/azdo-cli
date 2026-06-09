# Data Model: Multi-Organization Support

## Configuration file (`~/.azdo/config.json`)

```typescript
/** Settings storable in any scope (default or per-org). */
interface ScopedSettings {
  project?: string;
  fields?: string[];     // org scope FULLY REPLACES default (no merge)
  markdown?: boolean;
}

/** Full config file shape. Top level = default scope (back-compat). */
interface CliConfig extends ScopedSettings {
  org?: string;                                   // default org — top level only, never inside a scope
  organizations?: Record<string, ScopedSettings>; // key: organization name, lower-cased
}
```

### Invariants

- A pre-feature config file (no `organizations` key) is a valid new-format file; nothing else changes shape (FR-007).
- `organizations` keys are normalised to lower case on write; lookups lower-case the input (case-insensitive orgs).
- `org` is rejected as a key inside an org scope (the scope's map key *is* the org).
- An org scope with no remaining keys is removed from the map on save (no empty objects).

### Resolution function

```typescript
resolveScopedConfig(org?: string): ScopedSettings & { org?: string }
// value(key) = organizations[lc(org)]?.[key] ?? topLevel[key]   (per key)
```

| Input | `fields` resolved as |
|-------|----------------------|
| org has a scope defining `fields` | the scope's list, alone (full replace) |
| org has a scope without `fields` | default-scope list |
| org has no scope / no org known | default-scope list |

## Scope operations

| Operation | Semantics | Collision rule |
|-----------|-----------|----------------|
| `set/get/unset key --org N` | per-key CRUD inside scope `N` (created on first set) | n/a |
| `org-copy F T` | deep-copy scope `F` (or the default-scope `project`/`fields`/`markdown` when `F` = `default`) into scope `T`; source untouched; copies are independent | fail listing colliding keys unless `--force` |
| `org-move F T` | copy `F`→`T` then delete `F` (atomic in one save) | same as copy |
| `org-delete N` | remove scope `N` | n/a (idempotent error if absent) |

## Remote candidate (in-memory, `git-remote.ts`)

```typescript
interface RemoteCandidate {
  remoteName: string;   // e.g. "origin", "azdo"
  org: string;
  project: string;      // '' when URL had DefaultCollection
  hasEmbeddedSecret: boolean; // https userinfo contains ':' (user:secret@)
}
```

### Selection (FR-011..FR-013)

1. Parse every `git remote` URL with the existing patterns → candidates.
2. `origin` among candidates → select `origin`.
3. All candidates share org+project (case-insensitive) → select the first.
4. ≥2 distinct org/project pairs, no `origin` → throw ambiguity error listing `remoteName → org/project` pairs.
5. No candidates → existing "provide --org and --project" guidance.

The selected candidate drives both `detectAzdoContext()` (org/project) and `detectRepoName()` (repo), and is the only one evaluated for the credentials warning (`hasEmbeddedSecret` → warn once, naming `remoteName`).

## Missing-field degradation (in-memory, `azdo-client.ts`)

```typescript
interface FieldValidationResult {
  existing: string[];   // requested extra fields present in the org
  missing: string[];    // requested extra fields absent — one stderr warning each
}
```

State flow: `getWorkItem(fields)` → 400 + `TF51535` → fetch org field list → partition requested fields → warn per missing → retry once with `existing` only → success (exit 0). A second 400 on retry is a real error and propagates unchanged.
