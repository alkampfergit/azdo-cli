# Research: Auth Diagnostics

## 1. Credential Source — existing `resolveAuthCredential` shape

**Decision**: Reuse `resolveAuthCredential()` in `src/services/auth.ts` directly.

The function already returns `{ pat, source, kind }` where:
- `source` ∈ `'env' | 'credential-store'` — maps to human-readable "Environment variable (AZDO_PAT)" or "OS credential store"
- `kind` ∈ `'pat' | 'oauth'` — maps to "PAT" or "OAuth"

No new data-fetching needed; diagnose just calls this and formats the result.

**Rationale**: Avoids duplicating credential-resolution logic; the diagnose command is a consumer of the existing auth service, not a reimplementation.

## 2. Connectivity Test Endpoint

**Decision**: `GET https://dev.azure.com/{org}/_apis/projects?api-version=7.1&$top=1`

**Rationale**:
- Requires authentication → catches invalid/expired credentials
- Requires the "Project and Team (read)" scope → catches under-scoped PATs (the most common failure mode per issue #68)
- Returns a small payload (`$top=1`) — fast and low-bandwidth
- No side effects (read-only)
- Available in every ADO org regardless of project configuration

**Alternatives considered**:
- `/_apis/connectionData` — auth-only, does NOT validate PAT scope; rejected because the user's problem was scope, not just connectivity
- `/_apis/profile/me` — profile API, not always available for PAT auth on org-scoped tokens; rejected for inconsistency
- Per-scope matrix test (C from clarify) — expensive, complex; rejected by owner (chose B)

## 3. Trace Log Architecture

**Decision**: Thin `TraceWriter` class in `src/services/trace-writer.ts`; `fetchWithErrors` in `src/services/azdo-client.ts` gains an optional `TraceWriter | null` parameter; a module-level singleton is set when `--trace` is parsed at startup.

**Rationale**: Keeps `fetchWithErrors` as the single HTTP gateway — all HTTP traffic flows through it already. Adding a trace parameter avoids wrapping `fetch` globally (which would catch non-ADO requests on future additions).

**Alternatives considered**:
- Monkey-patching global `fetch` — would catch all fetches including OAuth token refresh calls; overly broad and harder to test
- Passing trace path through `AzdoContext` — would require modifying every call site; rejected (YAGNI)

## 4. File Permissions (FR-008)

**Decision**: Create trace file with `fs.open(path, 'a', 0o600, ...)` (owner read/write only on Unix). On Windows, NTFS ACLs are not set programmatically — document that restrictive-mode behavior is Unix/macOS only; Windows defaults to the user's standard ACL which is already user-scoped in most environments.

**Rationale**: Consistent with how `.env` files and SSH keys are handled. The `0o600` mode is the de-facto standard for secrets-adjacent files in Unix tooling.

## 5. Global `--trace` Flag Wiring

**Decision**: Register `--trace <filepath>` on the root `program` Command in `src/index.ts`. Parse it via `program.opts()` before action handlers run, initialise the `TraceWriter` singleton, and pass it into the service layer via a module-level export from `trace-writer.ts`.

**Rationale**: Commander.js root options are available to all subcommands without threading the value through every command's options object. This is the same pattern used for other global flags in the codebase.
