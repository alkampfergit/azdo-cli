# Research: 043-dpapi-credential-store

## R-1 DPAPI binding

| Option | Verdict |
| --- | --- |
| `powershell.exe` + `ProtectedData` | Rejected: 0.3–1 s per read, breaks under Constrained Language Mode / AppLocker, hard to test. |
| **`@primno/dpapi` 2.0.1** | **Chosen.** MIT, N-API prebuilds for win32-x64/arm64 (no compiler at install), only dependency `node-gyp-build`, install script is `exit 0`, ~280 KB. Exposes `protectData`/`unprotectData(data, entropy, 'CurrentUser')` and `isPlatformSupported`. |
| `koffi` FFI to `crypt32` | Rejected: generic ~1 MB/platform FFI layer and hand-written `DATA_BLOB` marshalling. |
| `win-dpapi` | Rejected: unmaintained since 2022. |

Off Windows the package loads but reports `isPlatformSupported: false`;
`loadDpapi()` turns that into an error, and it is only ever called when `dpapi`
is selected, so Linux/macOS installs are unaffected.

## R-2 SSH logon and the DPAPI master key

DPAPI `CurrentUser` decrypts with the user's master key, which is unlocked by
the logon credential. An OpenSSH **password** logon has it. A **public-key**
logon may get a token without it: protect/unprotect can fail, or data written in
that session may not be readable from an interactive one (or vice versa). The
round trip in FR-004 turns the first case into a clear failure at `auth login`;
the read-side message covers the second.

## R-3 Manual verification matrix (needs a real Windows host)

Not runnable in CI (Linux). To be confirmed on the owner's box before release:

| # | Write in | Read in | Expected |
| --- | --- | --- | --- |
| 1 | SSH, password | same session | works |
| 2 | SSH, public key | same session | works, or `auth login` fails with "Nothing was stored" |
| 3 | SSH, password | console | works |
| 4 | console | SSH, password | works |
| 5 | SSH, public key | console | works, or clear exit-4 decrypt message |
| 6 | console | SSH, public key | works, or clear exit-4 decrypt message |
