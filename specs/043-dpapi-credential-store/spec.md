# Feature Specification: DPAPI credential store on Windows

**Feature Branch**: `feature/043-dpapi-credential-store`
**Created**: 2026-09-28
**Status**: Draft
**Input**: GitHub issue #107.

## Context

Every stored credential (PAT and OAuth) goes through `@napi-rs/keyring`, which
on Windows means Credential Manager. An OpenSSH logon on Windows has no
credential vault, so every `auth login` / authenticated command over SSH fails
with exit 4 ("vault unavailable"). `AZDO_PAT` and `.env` work over SSH but keep
the PAT in plaintext. The issue asks for the middle ground git already offers
with `git config --global credential.credentialStore dpapi`: an encrypted file
in the user profile, protected by Windows DPAPI.

## Decisions agreed on the issue

- **D-1 Global only.** One `credentialStore` config key (`keyring` default |
  `dpapi`), plus an `AZDO_CREDENTIAL_STORE` environment override. No per-org form.
- **D-2 Native addon, not PowerShell.** `@primno/dpapi` (MIT, N-API, prebuilt
  win-x64/arm64) instead of spawning `powershell.exe` per read — see research.md.
- **D-3 No automatic fallback, no automatic migration.** An unreachable
  Credential Manager never silently writes to disk; the exit-4 message suggests
  the setting. Switching stores moves nothing by itself — but see D-5.
- **D-5 Copy on switch, consented (owner request on PR #110).** `config set
  credentialStore dpapi` offers to copy the Credential Manager credentials into
  the DPAPI store: a `[Y/n]` prompt on a terminal, `--copy-credentials` /
  `--no-copy-credentials` to decide up front, and only a stderr hint otherwise.
  Copy, not move: keyring entries are kept and existing DPAPI files are never
  overwritten.
- **D-4 Round-trip on write.** Protect, then unprotect and compare, before the
  file is written — the owner uses both password and public-key SSH logons, and
  the latter may lack the DPAPI master key.

## User Scenarios

### US-1 — Store a credential over SSH (P1)
On a Windows host over OpenSSH, the user runs
`azdo config set credentialStore dpapi` and `azdo auth login`. The credential is
stored in `%USERPROFILE%\.azdo\credentials\`, and later `azdo` commands in the
same or another session of the same user authenticate with it.

### US-2 — One-off override (P2)
`AZDO_CREDENTIAL_STORE=dpapi` selects the store for one session without changing
the config; `AZDO_CREDENTIAL_STORE=keyring` overrides a `dpapi` config.

### US-3 — A logon that cannot decrypt (P1)
When DPAPI can encrypt but not decrypt in the current logon, `auth login` fails
with exit 4, stores nothing, and names the likely cause and the workarounds.

### US-4 — Not on Windows (P2)
`azdo config set credentialStore dpapi` is refused (exit 1) off Windows; an
`AZDO_CREDENTIAL_STORE=dpapi` there fails with exit 4 rather than using the keyring.

## Functional Requirements

- **FR-001** `credentialStore` is a global config key accepting `keyring` or
  `dpapi` (case-insensitive, stored lower-case). It is not an org-scoped key,
  `org-copy default` does not copy it, and the wizard does not prompt for it.
- **FR-002** `AZDO_CREDENTIAL_STORE`, when non-empty, overrides the config key.
- **FR-003** With `dpapi`, each keyring account `pat:<org>` maps to
  `~/.azdo/credentials/<escaped account>.dpapi`; characters outside
  `[A-Za-z0-9_.-]` become `_<hex>`. The file holds the same serialized envelope
  the keyring holds, encrypted with `CryptProtectData` at `CurrentUser` scope and
  with entropy `azdo-cli:<account>`.
- **FR-004** Writes are atomic (temp file + rename); a write is preceded by an
  unprotect-and-compare round trip, and a failed round trip writes nothing.
- **FR-005** Every `auth` command, the resolution ladder, OAuth refresh and the
  audit events behave identically; the backend is reported as `windows-dpapi`.
- **FR-006** An invalid store value, `dpapi` off Windows, a missing addon, and an
  unreadable / undecryptable file are `CredentialStoreUnavailableError` (exit 4)
  with a specific message. There is never a fallback to another store.
- **FR-007** The legacy `pat` keyring slot migration does not run under `dpapi`.
- **FR-008** The Credential Manager unavailable message on Windows suggests
  `azdo config set credentialStore dpapi`.
- **FR-009** The addon is loaded lazily, only when `dpapi` is in effect.
- **FR-010** After `config set credentialStore dpapi`, orgs known from the
  audit log or config whose keyring slot holds a value are offered for copying
  (D-5). Each copied org gets an `auth.store` audit event with backend
  `windows-dpapi`; a per-org failure is reported and does not stop the rest; an
  unreachable Credential Manager keeps the setting and says to copy from a
  console session. `--json` never prompts and adds `credentialsCopied`.

## Out of scope

Explicit ACL tightening (the files inherit the profile folder ACL; DPAPI
provides confidentiality), `LocalMachine` scope, a standalone migration command, per-org
stores.

## Success Criteria

- **SC-001** Unit tests cover the store file I/O, round-trip refusal, entropy
  binding, selection precedence, and the non-Windows refusal.
- **SC-002** The manual matrix in research.md R-3 passes on a real Windows host.
