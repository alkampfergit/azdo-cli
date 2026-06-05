# CLI Contract: config command group & changed runtime behaviours

## `azdo config set <key> <value> [--org <name>]`

- Without `--org`: today's behaviour (default scope) — unchanged.
- With `--org acme`: writes into `organizations.acme` (created on demand; name lower-cased).
- Valid scoped keys: `project`, `fields`, `markdown`. `org` with `--org` → error `The "org" key cannot be set inside an organization scope.` Exit 1.
- Empty value with `--org` deletes the key from the scope (mirrors default-scope behaviour).

## `azdo config get <key> [--org <name>] [--json]`

- With `--org acme`: returns the **resolved** value for that org (scope value, else default) and its provenance.
- JSON: `{ "key": "fields", "value": [...], "scope": "acme" | "default" }`.

## `azdo config unset <key> [--org <name>]`

- With `--org`: removes the key from that scope only; default scope untouched (FR-005). Removing the last key removes the scope.

## `azdo config list [--json]`

Human output groups by scope:

```
Default:
  org       = primary
  project   = MainProject
  fields    = Custom.BusinessDescription
Organization secondary:
  project   = OtherProject
  fields    = System.Tags
```

JSON: `{ "default": { ... }, "organizations": { "secondary": { ... } } }` (FR-004).

## `azdo config org-copy <from> <to> [--force]`

- `<from>`: an existing org scope name or the literal `default` (copies `project`/`fields`/`markdown` from the top level).
- Creates/extends `<to>`; on key collision without `--force`: error listing colliding keys, exit 1, nothing written (FR-006a).
- Source unchanged; subsequent edits independent.

## `azdo config org-move <from> <to> [--force]`

- Copy semantics above, then `<from>` scope removed; single atomic file save (FR-006).

## `azdo config org-delete <name>`

- Removes the scope; error (exit 1) if it does not exist.

## Changed runtime behaviours (existing commands)

### Org-aware settings resolution

Every command that reads `fields` / `markdown` / `project` resolves them **after** the target org is known, via `resolveScopedConfig(org)` (FR-001/FR-002). Flags still win over any config (FR-014).

### `get-item` (and read paths) — missing-field degradation

- 400 + `TF51535` → warn per missing field on **stderr**: `azdo: warning: field 'Custom.X' does not exist in organization 'acme' and was skipped` — then render the work item from a single retry. Exit 0 (FR-008/FR-009).
- `--json`: stdout payload unchanged and valid; warnings only on stderr (FR-010).
- Retry failure → original error propagation (real error, non-zero exit).

### Context detection

- All git remotes considered; selection per data-model rules (FR-011..FR-013). Ambiguity error format:

```
Multiple Azure DevOps remotes found with different org/project:
  azdo    → orgA/Project1
  backup  → orgB/Project2
Use --org/--project (or 'git remote rename <name> origin') to disambiguate.
```

- No raw git stderr ever reaches the console (FR-015): all `execSync` git calls use `stdio: ['ignore','pipe','ignore']`.

### Credentials warning

- Fires only for `https://user:secret@…` URLs on the **selected** remote; bare `user@` silent (FR-016).
- Message names the remote, never echoes the URL: `azdo: warning: remote '<name>' includes embedded credentials; consider removing them with 'git remote set-url <name> <clean-url>'`.
- Once per process, stderr only, never affects exit code.
