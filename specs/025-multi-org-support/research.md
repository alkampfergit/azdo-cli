# Research: Multi-Organization Support

All spec-level ambiguities were resolved by the owner on issue #55 (Clarifications Session 2026-06-05). This document records the implementation-level decisions.

## R-1 — Config schema: layering per-org scopes onto `~/.azdo/config.json`

**Decision**: Extend the existing JSON file with an optional `organizations` object keyed by lower-cased org name:

```json
{
  "org": "primary",
  "project": "MainProject",
  "fields": ["Custom.BusinessDescription"],
  "markdown": true,
  "organizations": {
    "secondary": { "project": "OtherProject", "fields": ["System.Tags"] }
  }
}
```

Top-level keys remain the **default scope** — an existing pre-feature file is already a valid new-format file (FR-007, zero migration). Org scopes may define `project`, `fields`, `markdown`; the `org` key itself is rejected inside a scope (an org scope's identity *is* its key).

**Rationale**: Single file, single read path, backward compatible by construction; matches Constitution V (no new config formats).

**Alternatives considered**: per-org files under `~/.azdo/orgs/<name>.json` (more I/O, harder list/move/copy, breaks the single-file mental model); profiles with an `active` pointer (requires explicit switching — the spec wants automatic per-org application).

## R-2 — Scope resolution semantics

**Decision**: `resolveScopedConfig(org?: string): CliConfig` merges per key: value = `organizations[lc(org)]?.[key] ?? topLevel[key]`. For `fields` the org value **fully replaces** the default list (owner clarification — no merging). Org-name comparison is case-insensitive: keys are normalised to lower case on write and lookup.

**Rationale**: Per-key override is the least surprising layering and was implied by the spec; full-replace for lists is the owner's explicit choice.

**Alternatives considered**: list merge / merge-with-exclusions — rejected by owner (Clarification Q1).

## R-3 — TF51535 recovery: validate-and-retry, not message parsing

**Decision**: `getWorkItem` keeps the existing single-request happy path. When the request fails with HTTP 400 and the server message contains `TF51535`, fall back to: (1) fetch the org's field list via the existing `getWorkItemFields` endpoint; (2) compute the missing subset of the requested extra fields (case-insensitive reference-name comparison); (3) emit one stderr warning per missing field (`azdo: warning: field 'X' does not exist in organization 'Y' and was skipped`); (4) retry once with only the existing fields. Exit code stays 0; `--json` output remains clean (warnings on stderr only).

**Rationale**: Zero overhead when nothing is missing (SC-002 today-path unchanged); avoids parsing localized error text for field names (only the stable `TF51535` code is matched); deterministic — all missing fields are reported in one pass instead of one failure per retry.

**Alternatives considered**: pre-validating fields on every call (adds an HTTP round-trip to the happy path); parsing the field name out of the TF51535 message and looping (message text/locale dependent, N round-trips for N missing fields).

## R-4 — Remote enumeration and selection rules

**Decision**: Replace the hard-coded `git remote get-url origin` with: enumerate `git remote`, get each URL, parse with the existing `parseAzdoRemote` patterns. Selection: (a) if `origin` parses as Azure DevOps → use it (no behaviour change); (b) else if all parsing remotes agree on org+project (case-insensitive) → use that, regardless of count or names; (c) else if ≥2 distinct org/project candidates → error listing the candidates and asking for `--org`/`--project`; (d) none → existing guidance error. `detectRepoName` uses the same selected remote.

**Rationale**: Implements FR-011..FR-013 exactly; `origin`-first preserves SC-006.

**Alternatives considered**: configurable preferred-remote name (YAGNI — selection rules cover the reported scenario); first-azdo-remote-wins (silent guessing forbidden by FR-013).

## R-5 — Suppressing git stderr (FR-015)

**Decision**: Every `execSync('git …')` in `git-remote.ts` passes `stdio: ['ignore', 'pipe', 'ignore']` so git's `fatal:` output never inherits the CLI's stderr. Failures still surface as thrown errors handled by the existing friendly-guidance paths.

**Rationale**: `execSync` inherits the parent's stderr by default — that is exactly the reported leak (printed twice: once for org resolution, once for project/repo detection).

**Alternatives considered**: `2>/dev/null` shell redirection (not portable to Windows cmd); switching to `spawnSync` (larger diff, no added value).

## R-6 — Credentials warning trigger and wording

**Decision**: The trigger regex narrows from "any HTTPS userinfo" to "userinfo containing a colon" (`/^https?:\/\/[^@/]*:[^@/]+@/`) — i.e. only `user:secret@` fires (owner clarification Q2). The message is parameterised with the **remote name** (never the URL): `azdo: warning: remote '<name>' includes embedded credentials; consider removing them with 'git remote set-url <name> <clean-url>'`. Still once per process, stderr, never throws, never alters exit codes.

**Rationale**: Bare `user@` is Azure DevOps' default clone-URL shape and contains no secret; warning text keeps the existing no-URL-content guarantee (no credential can leak into stderr).

**Alternatives considered**: config-suppressible warning (owner chose B, not C/D); keeping `origin` hard-coded in the message (wrong once any remote can be selected).

## R-7 — `config` command surface for scope management

**Decision**: Extend the existing `config` group (no new top-level command):

- `azdo config set <key> <value> --org <name>` / `get <key> --org <name>` / `unset <key> --org <name>` — org-scoped CRUD (`--org` omitted = default scope, exactly today's behaviour).
- `azdo config list [--json]` — shows the default scope plus every org scope with its name.
- `azdo config org-copy <from> <to>` — copy a whole scope (`from` may be `default`); fails on existing target keys unless `--force`.
- `azdo config org-move <from> <to>` — re-scope; fails on collision unless `--force`.
- `azdo config org-delete <name>` — remove an org scope entirely.

`org` is not a valid key inside an org scope; `project`, `fields`, `markdown` are.

**Rationale**: Single Responsibility (each subcommand one operation), CLI-first, discoverable under the existing `config` namespace; `default` as a reserved source name makes copy-from-default natural (owner-requested copy feature).

**Alternatives considered**: overloading `unset --org <name>` with no key to delete a scope (ambiguous); a separate `azdo orgs` command group (fragments configuration surface).
