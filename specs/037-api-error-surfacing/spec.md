# Feature Specification: Surface Azure DevOps error bodies, pre-flight the composed PR description

**Feature Branch**: `feature/037-api-error-surfacing`
**Created**: 2026-09-15
**Status**: Draft
**Input**: GitHub issue #95 (child of #92, point 1) plus the clarification round recorded on that issue.

## Context

Two defects that compound on `azdo pr open`, but the first one affects every command:

1. **Every non-404 API failure is opaque.** `fetchWithErrors` in
   `src/services/azdo-client.ts` maps 401 → `AUTH_FAILED`, 403 →
   `PERMISSION_DENIED`, 404 → `NOT_FOUND | url=… | body=…`, and returns
   everything else to the caller, where ~18 call sites throw a bare
   ``new Error(`HTTP_${response.status}`)``. The Azure DevOps response body —
   which carries the real `message` / `typeKey` — is read for the trace file
   and then discarded. The user sees `Error: Azure DevOps request failed with
   HTTP_400.` with no field, no reason, no length.

2. **`pr open` silently grows the description.** `composeDescription` joins the
   operator's `--description` and the repository PR template with `\n\n` and no
   length check. Azure DevOps caps a PR description at 4000 characters, so a
   2299-character description plus an 1871-character template is rejected
   server-side with an opaque HTTP 400 and no PR is created. The caller cannot
   budget for this themselves: they would have to know a template exists, find
   its path, and measure it before sizing their text.

### Decisions locked on issue #95

| # | Decision |
|---|---|
| Q1 | Hard client-side pre-flight at 4000 characters, plus an enriched 400 handler as backstop. No override flag. |
| Q2 | Keep the `HTTP_<status>` sentinel prefix; append the detail (`HTTP_400: <message> [typeKey]`). No new error type. |
| Q3 | All non-2xx statuses, **including** 401/403 — the curated auth guidance stays and the server detail prints under it. The existing `text/html` guard stays, so the AAD sign-in page is never echoed. |
| Q4 | Print the parsed `message` (plus `typeKey`/`errorCode` when present), truncated at 500 characters, through `redactBody`. Unparseable body → first 200 raw characters. The full body stays in the trace file. |
| Q5 | Error only — no `--no-template`, no `--truncate`. |
| Blocker 1 | The 12 exact-equality sentinel comparisons (`=== 'AUTH_FAILED'` / `=== 'PERMISSION_DENIED'`) become prefix matches, so appending a detail never strips the curated guidance. |

The 4000-character cap is **documented**, verified through the Microsoft Learn
MCP server per Constitution Principle VI:
<https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests/update?view=azure-devops-rest-7.1>
— *"These are the properties that can be updated with the API: … Description
(up to 4000 characters)"*. Cross-checked against Context7
(`/websites/learn_microsoft_en-us_rest_api_azure_devops`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A failed request explains itself (Priority: P1)

An operator runs any `azdo` command that hits the Azure DevOps REST API and the
server rejects the request. Today they get a status number. They should get the
server's own explanation, which is the only thing that names the offending
field, work-item rule, or limit.

**Why this priority**: it is the difference between "the tool is broken" and "my
PAT is missing a scope" / "that field does not exist". It improves every command
group at one change point.

**Independent Test**: stub a non-2xx response carrying a JSON body with a
`message`, invoke any client function, assert the thrown message contains both
the sentinel and the server text.

**Acceptance Scenarios**:

1. **Given** Azure DevOps replies `400` with `{"message":"The pull request description is too long.","typeKey":"InvalidArgumentValueException"}`, **When** the operator runs the command, **Then** stderr names the server message and the `typeKey`, not just `HTTP_400`.
2. **Given** Azure DevOps replies `403` with `{"message":"TF401019: The Git repository with name or identifier X is disabled."}`, **When** the operator runs a `pr` command, **Then** stderr still shows the curated "Access denied. Your PAT may lack write permissions…" line **and** the server message beneath it, and the exit code is still 4.
3. **Given** the failure body is not JSON, **When** the command fails, **Then** the first 200 characters of the raw body are shown instead.
4. **Given** the failure body is HTML (the AAD sign-in page), **When** the command fails, **Then** no body content is echoed — only the curated authentication message.

---

### User Story 2 - `pr open` refuses an over-long description before the call (Priority: P1)

An operator runs `azdo pr open --title … --description …` in a repository whose
PR template is long. The composed description exceeds 4000 characters.

**Why this priority**: the failure is deterministic, client-side knowable, and
currently costs a round trip plus an unexplained 400.

**Independent Test**: stub a template of known length, pass a description of
known length, assert the error message and that no create request was issued.

**Acceptance Scenarios**:

1. **Given** a 2299-character `--description` and an 1871-character repository template, **When** the operator runs `pr open`, **Then** the command fails **before** any create call with a message naming the provided length, the template length and its path, the separator cost, the composed total, the 4000 limit, and the number of characters to remove.
2. **Given** a description that fits, **When** the operator runs `pr open`, **Then** behaviour is unchanged and the PR is created.
3. **Given** the composed description passes the pre-flight but Azure DevOps rejects the create with a 400 anyway, **When** the command fails, **Then** the error carries both the server's message and the same arithmetic.
4. **Given** no `--description` and no template, **When** the operator runs `pr open`, **Then** the existing `--description is required` error is unchanged.

---

### Edge Cases

- A non-2xx response whose body is empty → sentinel alone, no trailing separator.
- A non-2xx response whose body is JSON but has no `message` → fall back to `typeKey`/`errorCode`, else the raw-prefix rule.
- A body longer than 500 characters → truncated with an explicit `…` marker; the trace file keeps the full body.
- A body containing a token-like string → passed through the existing `redactBody` before printing.
- A 400 that already has a curated handler (`BAD_REQUEST:`, `CREATE_REJECTED:`, `UPDATE_REJECTED:` in `azdo-client.ts`) must keep its curated wording — enrichment must not cannibalise it.
- A 404 keeps its existing `NOT_FOUND | url=… | body=…` shape; callers that swallow `NOT_FOUND` (PR template probing) must keep working.
- Exactly 4000 composed characters is accepted; 4001 is rejected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The HTTP layer MUST capture the response body of every non-2xx Azure DevOps response at a single point and make it available to whichever error is thrown for that response.
- **FR-002**: The detail MUST be derived as: JSON `message` when present; else JSON `typeKey`/`errorCode`; else the first 200 characters of the raw body. When both `message` and `typeKey`/`errorCode` are present, both are shown.
- **FR-003**: The detail MUST be passed through the existing `redactBody` redaction and truncated to 500 characters, with truncation visibly marked.
- **FR-004**: When the response content type is `text/html`, no body detail MUST be emitted (the AAD sign-in page is never echoed); the existing HTML→`AUTH_FAILED` mapping is unchanged.
- **FR-005**: 401 MUST throw `AUTH_FAILED[: <detail>]` and 403 `PERMISSION_DENIED[: <detail>]`, preserving the bare sentinel as a prefix.
- **FR-006**: Every `HTTP_<status>` throw site MUST emit `HTTP_<status>[: <detail>]`.
- **FR-007**: Every command-layer comparison against `AUTH_FAILED` / `PERMISSION_DENIED` MUST be a prefix match, so the curated guidance and the exit codes (4 for not-permitted) are preserved when a detail is appended.
- **FR-008**: Command error handlers MUST print the curated guidance first and the server detail on a following line, never replacing one with the other.
- **FR-009**: The existing curated 400 errors (`BAD_REQUEST:`, `CREATE_REJECTED:`, `UPDATE_REJECTED:`) MUST keep their current wording and remain reachable.
- **FR-010**: `pr open` MUST compute the composed description length (provided text + separator + template) before issuing the create request.
- **FR-011**: When the composed length exceeds 4000 characters, `pr open` MUST fail before the create request with a message naming: provided characters, template characters and template path, separator characters, composed total, the 4000 limit, and the required reduction.
- **FR-012**: When Azure DevOps rejects a `pr open` create with a 400 despite the pre-flight, the error MUST carry the server message **and** the composed-description arithmetic.
- **FR-013**: The 4000 constant MUST be a named constant carrying the Learn URL it was verified against.
- **FR-014**: `docs/commands.md` MUST document the template contribution to the description and the 4000-character write limit, including that the limit applies to the *composed* text.

### Out of scope

- `pr update` (#96), `pr abandon` (#97), `auth token` (#98).
- A typed `AzdoApiError` model (Q2 = A).
- Any PR **title** length check — no cap is documented on either the create or the update Learn page.
- `--no-template` / `--truncate` escape hatches (Q5 = A).

### Key Entities

- **Failure detail**: the redacted, truncated, human-readable rendering of an Azure DevOps error body — `message`, `typeKey`, `errorCode`.
- **Description budget**: provided characters, separator characters, template characters and path, total, limit, overflow.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A failing request against any endpoint prints the server's own message; zero commands print a status-only error when the server supplied a body.
- **SC-002**: An over-long composed description fails with zero create requests issued, and the message alone is enough to compute the required edit.
- **SC-003**: Every pre-existing curated error message (auth, permission, not-found, bad-request, create/update-rejected) and every `pr` exit code is unchanged by this feature.
- **SC-004**: Unit tests cover the enrichment path (JSON body, `typeKey`-only body, unparseable body, HTML body, truncation, 401/403 reaching the curated handler) and the pre-flight arithmetic (under, exactly at, and over the limit; with and without a template).
