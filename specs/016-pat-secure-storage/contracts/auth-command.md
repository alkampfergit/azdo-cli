# Contract — `azdo auth` CLI surface

Commander-based command tree. Default action (no subcommand) = interactive auth.

## `azdo auth [--org <name>] [--from-stdin] [--browser | --no-browser]`

Interactively obtain and store a PAT for the resolved org.

### Options

| Flag | Type | Default | Semantics |
|---|---|---|---|
| `--org <name>` | string | _resolved via resolveOrg()_ | Target Azure DevOps organization. When absent, resolved via FR-013 chain. |
| `--from-stdin` | boolean | `false` | Read PAT from stdin (non-interactive). When `true`, terminal prompts and browser-assist are suppressed. Satisfies FR-011. |
| `--browser` / `--no-browser` | boolean | `true` on TTY with `$DISPLAY` / default browser available, else `false` | Controls whether the Azure DevOps PAT creation page is opened. `--no-browser` forces URL-print only. |

### Behaviour

1. Resolve `org` via `resolveOrg({ org: options.org })`.
2. If `--from-stdin`, read until EOF → PAT. Else: open browser (if `--browser` and capable) → prompt interactively (masked input via existing `promptForPat()`).
3. Validate PAT against Azure DevOps (research §8). On invalid, exit `2` with diagnostic; no store, audit `auth.validate.fail`.
4. If a credential already exists for `org`, prompt for overwrite confirmation on TTY; `--from-stdin` implies yes.
5. Store via `credential-store.storePat(org, pat)`. Audit `auth.validate.ok` + `auth.store`.
6. Exit `0` with `stdout`: `PAT stored for org <name> in <backend>.`

### Exit codes

| Code | Meaning |
|---|---|
| `0` | PAT stored successfully. |
| `1` | Generic failure (IO, keyring unexpected error). |
| `2` | PAT validation failed (401/403). |
| `3` | Org could not be resolved (all 4 steps of FR-013 exhausted). |
| `4` | OS secret backend unavailable (FR-010). |

## `azdo auth status [--org <name>] [--json]`

Reports whether a PAT is stored for the resolved org.

### Options

| Flag | Type | Default | Semantics |
|---|---|---|---|
| `--org <name>` | string | _resolved via resolveOrg()_ | Org to inspect. |
| `--json` | boolean | `false` | Emit a JSON object instead of human text. |

### Output — human (default)

```text
Organization: mycompany
Backend:      macos-keychain
Stored:       yes
Identifier:   abcde**********vwxyz
Last updated: 2026-04-22T16:20:00Z (from audit log)
```

### Output — JSON (`--json`)

```json
{
  "org": "mycompany",
  "backend": "macos-keychain",
  "stored": true,
  "masked": "abcde**********vwxyz",
  "updated_at": "2026-04-22T16:20:00Z"
}
```

### Never printed

The full PAT value MUST NOT appear in either output mode.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Stored PAT present. |
| `1` | Stored PAT absent (not an error, but exits non-zero so scripts can `if azdo auth status --org X`). |
| `3` | Org could not be resolved. |
| `4` | OS secret backend unavailable. |

## `azdo auth logout [--org <name>] [--all]`

Removes stored PAT(s).

### Options

| Flag | Type | Default | Semantics |
|---|---|---|---|
| `--org <name>` | string | _resolved via resolveOrg()_ | Org to remove. |
| `--all` | boolean | `false` | Remove every stored PAT (all orgs). `--org` and `--all` are mutually exclusive. |

### Behaviour

1. With `--org` / resolved org: delete that org's slot. If slot absent, exit `0` with `stdout`: `No stored PAT found for org <name>.`
2. With `--all`: enumerate every `pat:*` slot under service `azdo-cli` and delete each. Emit one line per removed org.
3. Audit `auth.delete` per removed slot.
4. Exit `0` on success.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Done (including "nothing to remove"). |
| `1` | Unexpected IO / keyring failure during deletion. |
| `3` | Org could not be resolved (only when neither `--org` nor `--all` given AND no resolution succeeded). |
| `4` | OS secret backend unavailable. |

## `azdo clear-pat` (existing — kept as deprecated alias)

Equivalent to `azdo auth logout` with resolved org. Emits a one-line deprecation notice on `stderr`:

```text
`azdo clear-pat` is deprecated; use `azdo auth logout [--org <name>]` instead.
```

No behaviour change beyond the notice.
