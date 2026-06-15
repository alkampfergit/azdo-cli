# Feature Specification: Auth Diagnostics

**Feature Branch**: `030-auth-diagnostics`
**Created**: 2026-06-15
**Status**: Draft
**Input**: User description: "Help diagnostic for auth and path — auth diagnostics command"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Auth Diagnose Command (Priority: P1)

A developer runs `azdo auth diagnose` to understand why their PAT authentication is failing. The command prints the active auth method, the credential source, the org and project in use, and the result of a live connectivity test including the exact API error message.

**Why this priority**: Auth failures are a blocking problem. Without a way to see the actual error, users cannot self-serve and must file support requests. This is the core diagnostic capability.

**Independent Test**: Can be tested by running `azdo auth diagnose` against a known-good and a known-bad PAT and verifying the output fields and connectivity test result independently.

**Acceptance Scenarios**:

1. **Given** a valid PAT is stored, **When** the user runs `azdo auth diagnose`, **Then** the output shows auth type "PAT", the credential source (e.g. "windows-credential-manager"), the org name, and "Connectivity: OK".
2. **Given** an expired or invalid PAT is stored, **When** the user runs `azdo auth diagnose`, **Then** the output shows auth type, credential source, org, and "Connectivity: FAILED — <exact API error message>".
3. **Given** an OAuth token is active, **When** the user runs `azdo auth diagnose`, **Then** the output shows auth type "OAuth", the token source, org, and connectivity result.
4. **Given** no credentials are stored for the configured org, **When** the user runs `azdo auth diagnose`, **Then** the output clearly states no credentials found and exits with a non-zero code.

---

### User Story 2 - HTTP Request/Response Trace Log (Priority: P2)

A developer passes a global `--trace <file>` flag to any `azdo` command to write a redacted log of all HTTP requests and responses to a local file, enabling offline investigation of API communication failures.

**Why this priority**: Some auth failures manifest as unusual HTTP responses (wrong status codes, redirect loops, malformed tokens). A trace log lets advanced users inspect the actual API traffic without needing a network proxy.

**Independent Test**: Can be tested by running any `azdo` command with `--trace /tmp/trace.log` and verifying the log file is created with request/response entries and no Authorization header values present.

**Acceptance Scenarios**:

1. **Given** `--trace <path>` is passed, **When** the CLI makes any HTTP request, **Then** each request and response is appended to the file at `<path>` with method, URL, status code, and response body, and Authorization header values are fully redacted (replaced with `[REDACTED]`).
2. **Given** the trace file path does not exist, **When** `--trace` is used, **Then** the file is created automatically.
3. **Given** `--trace` is not passed, **When** a command runs, **Then** no trace file is created and behavior is identical to current.
4. **Given** a trace file is written, **When** it is inspected, **Then** no credential values, tokens, or PAT strings appear anywhere in the file.

---

### Edge Cases

- What happens when the `--trace` target path is not writable? → Command prints a warning to stderr and continues without tracing (non-fatal).
- What happens when the configured org does not exist in Azure DevOps? → `auth diagnose` reports the HTTP status code and response body from the connectivity test.
- What if the user has multiple orgs configured? → `auth diagnose` operates on the org resolved by the normal context resolution rules; it diagnoses one org at a time.
- What if the OAuth token is expired? → Diagnose attempts the connectivity test and surfaces the resulting API error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The CLI MUST provide an `azdo auth diagnose` subcommand that prints the active auth type (PAT or OAuth), the credential source location, the configured org, and the result of a live Azure DevOps connectivity test.
- **FR-002**: The connectivity test MUST be scope-aware: it MUST attempt a minimal scoped operation (e.g. listing projects) to verify both that credentials are accepted AND that the PAT has sufficient scope — not merely that the server responded. The exact API error message MUST be surfaced when either check fails.
- **FR-003**: The CLI MUST accept a global `--trace <filepath>` flag on any command that writes HTTP request and response details to the specified file.
- **FR-004**: The trace log MUST redact all credential values (PAT strings, Bearer tokens, Basic auth header values) replacing them with `[REDACTED]` before writing to disk.
- **FR-005**: The `auth diagnose` command MUST exit with a non-zero code when the connectivity test fails.
- **FR-006**: The `--trace` flag failure to open the output file MUST be non-fatal — the command continues and prints a warning to stderr.
- **FR-008**: The trace file MUST be created with owner-only permissions (readable and writable only by the current user) to protect potentially sensitive API response bodies.
- **FR-007**: The `auth diagnose` output MUST be human-readable plain text by default; a `--json` flag MAY be supported for machine-readable output.

### Key Entities

- **Auth Diagnostic Report**: The structured set of fields printed by `auth diagnose` — auth type, credential source, org, project (if set), connectivity status, and error detail.
- **Trace Entry**: One HTTP exchange (request + response) written to the trace log — method, URL, request headers (redacted), request body, status code, response headers, response body.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer encountering an auth failure can identify the root cause (wrong PAT scope, wrong org, expired token, missing credentials) without leaving the terminal — no external tools required.
- **SC-002**: The `auth diagnose` command completes and prints its report in under 5 seconds on a normal network connection.
- **SC-003**: The trace log never contains a credential value — verified by automated test scanning the output for known token patterns.
- **SC-004**: Reduce the "auth failed, no idea why" class of support questions by providing a self-service diagnostic path that surfaces actionable error details.

## Assumptions

- The existing `azdo auth` command group is the natural home for `azdo auth diagnose`; a flat `azdo diagnose` alias is out of scope.
- "Credential source" means the named store from which the token was retrieved (e.g. system keychain name, environment variable name, config file path) — not the token value itself.
- The connectivity test calls the same Azure DevOps endpoint that normal commands use, using the resolved credentials.
- The `--trace` flag is global (registered on the root command) and applies to every HTTP call the process makes during that invocation.
- Token redaction covers: `Authorization` header values, any query parameter named `token` or `pat`, and any JSON body field named `token`, `accessToken`, or `pat`.
- The trace log appends to an existing file so multiple invocations in a debugging session accumulate in one file.

## Clarifications

### Session 2026-06-15

- Q: Should `auth diagnose` follow normal context resolution (env vars → config → flags)? → A: Yes, same as all other commands; `--org` and `--project` overrides work if provided.
- Q: Should the trace log append or overwrite? → A: Append, so multiple invocations in a debugging session accumulate in one file.
- Q: Should the connectivity test be auth-only or scope-aware? → A: Scope-aware (Option B) — attempt a minimal scoped operation (e.g. list projects) to verify both auth and PAT scope validity.
- Q: Should the trace file use restrictive or default permissions? → A: Owner-only (Option A) — trace file is readable/writable only by the creating user to protect API response bodies.
