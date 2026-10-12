# Feature Specification: show the real credential-store error

**Feature Branch**: `feature/058-credential-error-cause`
**Status**: Approved (issue #155, owner: "implement")

## Requirements
- **FR-1**: `CredentialStoreUnavailableError` appends `Underlying error: <cause>` (token-shaped text scrubbed via `redactText`) when a cause exists.
- **FR-2**: On `linux-libsecret` the hint says the Secret Service may be missing **or unreachable** (sandbox/container blocking the D-Bus socket) and points to `AZDO_PAT`.
- **FR-3**: Documented in `docs/authentication.md` and `docs/linux-credential-store.md`.

## Out of scope
Classifying library error codes (`KeyRevoked`); behaviour and exit codes are unchanged.
