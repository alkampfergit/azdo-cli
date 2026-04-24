# Phase 0 — Research: Secure PAT Storage and `auth` Command

## 1. Credential store library

- **Decision**: Reuse `@napi-rs/keyring` (already a runtime dependency via spec 002).
- **Rationale**: Same author maintains bindings for all three target backends (Windows Credential Manager, macOS Keychain, Linux libsecret / Secret Service). No extra dependency. Napi prebuilds cover Node.js LTS on all three platforms.
- **Alternatives considered**:
  - `keytar` — unmaintained (last release 2020, deprecation notice), does not support current Node.js LTS prebuilds.
  - `@op/keychain` — macOS-only.
  - Custom DBus / win32 / Security.framework FFI — violates constitution principle V (Simplicity).

## 2. Multi-organization keying scheme

- **Decision**: Key stored credentials as `Entry(SERVICE="azdo-cli", ACCOUNT="pat:<org>")`. The per-org org key uses the exact `<org>` string as it resolves from `resolveOrg()` (case preserved).
- **Rationale**: Minimal change to the existing `credential-store.ts` API; `@napi-rs/keyring` indexes on (service, account) so this gives a stable, unique key per org. Case preservation matches Azure DevOps URL conventions.
- **Alternatives considered**:
  - `SERVICE="azdo-cli:<org>"`, `ACCOUNT="pat"` — same effect but varies the service label, making it harder to enumerate all azdo-cli entries from the OS vault UI.
  - JSON blob in a single slot — conflicts with SC-002 (no plaintext files) and requires manual encryption that defeats the OS-vault-only principle.

## 3. Organization resolution order (FR-013)

- **Decision**: `resolveOrg(opts)` returns the first of:
  1. `opts.org` (from `--org` flag).
  2. Auto-detect via `detectAzdoContext()` (`src/services/git-remote.ts`), using the `origin` remote.
  3. Persistent setting from `loadConfig().org` (`~/.azdo/config.json`).
  4. `null` → callers emit a clear diagnostic naming each step.
- **Rationale**: Mirrors `gh`, `git`, and `az` conventions. Auto-detect in working-context wins over a global default so that `cd`ing into a different org's repo "just works" without reconfiguration. Owner-confirmed in the clarify phase (see spec §Clarifications).
- **Alternatives considered**:
  - Existing order (flag → config → git-remote) — rejected by owner in clarify phase.
  - Interactive picker at every command — too noisy for scripting; violates FR-015's no-silent-prompt rule and breaks CI usage.

## 4. Environment variable precedence

- **Decision**: `AZDO_PAT` env var, when set and non-empty, is used verbatim as the PAT regardless of any stored credential. When the env var is set but empty, treat as unset (not as "deliberately blank") and fall through to the stored-PAT path.
- **Rationale**: Matches the existing `src/services/auth.ts` behaviour (line 100) and the README (`"Store PAT in OS credential store (or use AZDO_PAT)"`). FR-009 in the spec locks this precedence in as a requirement.
- **Alternatives considered**:
  - Stored wins — would frustrate CI workflows that set env vars deliberately.
  - Warn on both-set — a non-fatal `stderr` notice is allowed by FR-009 but not mandatory; deferred to an ergonomics polish task.

## 5. `clear-pat` command — keep, deprecate, or remove?

- **Decision**: Keep `clear-pat` as a thin alias that calls the same underlying service as `auth logout --org <resolved>`; emit a one-line deprecation notice to `stderr`.
- **Rationale**: Users have `clear-pat` in muscle memory and scripts. Removing it is a backward-incompatible break not required by this feature. A deprecation alias costs very little and sets up removal in a future major version (constitution principle IV — semantic versioning).
- **Alternatives considered**:
  - Remove immediately — breaks existing users' scripts for no gain.
  - Keep without deprecation — defers the clean-up indefinitely.
- **Pending owner confirmation** in the plan-approval comment (see plan summary).

## 6. Legacy single-slot PAT migration

- **Decision**: Lazy, opt-in migration. On any authenticated command invocation AND on `auth status`/`auth logout`, if a legacy slot `(azdo-cli, pat)` exists AND `config.org` is set AND no per-org slot exists for `config.org`, copy the PAT into `(azdo-cli, "pat:<config.org>")` and delete the legacy slot. Emit a one-line `stderr` notice: "Migrated legacy PAT to org <name>". If `config.org` is unset, leave the legacy slot untouched and emit a notice instructing the user to run `azdo auth --org <name>` to re-store.
- **Rationale**: Non-destructive. Runs lazily only when the user is already in the auth flow, so it can't surprise someone with a sudden vault write. Never drops the legacy PAT on the floor — either migrated or the user is told how to re-store.
- **Alternatives considered**:
  - Eager migration on CLI upgrade — requires version-tracking machinery the repo doesn't have.
  - Leave legacy slot alone, force manual re-auth — more surprising to existing users.
- **Pending owner confirmation** in the plan-approval comment.

## 7. Browser-assist for PAT creation (FR-006)

- **Decision**: Shell out to the platform-native opener:
  - macOS → `open <url>`
  - Linux → `xdg-open <url>` if available; else print the URL
  - Windows → `cmd /c start "" <url>`

  The target URL for Azure DevOps PAT creation is
  `https://<org>.visualstudio.com/_usersSettings/tokens` (resolved from the org; Microsoft also serves `https://dev.azure.com/<org>/_usersSettings/tokens`, which is the canonical current form).

  Detect headless via `!process.stdout.isTTY || process.env.DISPLAY === undefined` on Linux; on headless, skip the launch and print the URL.

- **Rationale**: Zero new runtime dependency (constitution IV). `xdg-open` / `open` / `start` are ubiquitous on their respective platforms. If they're missing (container without `xdg-utils`), the fallback of printing the URL is already acceptable per FR-006.
- **Alternatives considered**:
  - `open` npm package — adds a runtime dep.
  - `open-cli` — same, and CLI-shell overhead.

## 8. PAT validation against Azure DevOps (FR-003)

- **Decision**: Before storing a freshly supplied PAT, issue one lightweight authenticated request:
  `GET https://dev.azure.com/<org>/_apis/projects?api-version=7.1&$top=1` with `Authorization: Basic base64(":<pat>")`.
  A `200` response confirms the PAT is valid for the org. `401`/`403` → reject and invite retry. Any other status → surface the HTTP error and DO NOT store.
- **Rationale**: `/_apis/projects` is a stable, low-cost endpoint that every PAT with `vso.project` (or broader) scope can read. Using `$top=1` keeps the response body tiny. It's also the minimum read surface — we don't validate individual scopes at auth time; scope failures surface at the relevant command instead.
- **Alternatives considered**:
  - `/_apis/connectionData` — returns user info but has edge cases with guest access.
  - Scope-specific probes — matrix explodes; out of scope for this feature.

## 9. Audit log shape (FR-016)

- **Decision**: JSON-lines file at `~/.azdo/audit.log`. Each event:
  ```json
  {"ts":"2026-04-22T16:40:00Z","event":"auth.store","org":"mycompany","backend":"windows-credential-manager","masked_pat":"abcde**********vwxyz"}
  ```
  Events: `auth.store`, `auth.delete`, `auth.validate.fail`, `auth.validate.ok`. The PAT value is masked via the existing `maskedDisplay()` helper (5 visible chars each end). The full PAT is never written.
- **Rationale**: JSONL is trivially appendable, line-oriented (easy `tail`/`grep` for humans), machine-readable for future debugging. Sits next to `config.json` in the conventional `~/.azdo/` directory. Masking via the already-tested helper keeps SC-002 intact.
- **Alternatives considered**:
  - Syslog / OS event log — too platform-specific, violates simplicity.
  - No audit log — spec FR-016 requires it.

## 10. Testing approach

- **Decision**:
  - Unit tests use an in-memory `CredentialStore` interface injected in place of `@napi-rs/keyring`. The real keyring binding is wrapped thinly so the unit suite does not touch the host OS vault.
  - Integration tests hit the real keyring and are gated behind `AZDO_INTEGRATION=1` (opt-in). CI runs them on all three platforms; local runs skip by default.
  - Org-resolver tests mock `git-remote` detection via an injected reader.
  - Browser-open tests mock `node:child_process.execFile` (never actually spawn a browser).
- **Rationale**: Keeps the unit suite hermetic (constitution V, simplicity); the integration pass still validates the end-to-end vault contract on each platform.
- **Alternatives considered**:
  - Full-integration default — slow on Linux CI without libsecret installed.
  - No integration tests — leaves cross-platform behaviour unverified.
