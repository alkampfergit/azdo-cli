# Phase 0 Research: 037-api-error-surfacing

## 1. Azure DevOps PR description limit (Constitution Principle VI)

**Source (Microsoft Learn MCP, `microsoft_docs_fetch`)**:
<https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests/update?view=azure-devops-rest-7.1>

> These are the properties that can be updated with the API:
> - Status
> - Title
> - **Description (up to 4000 characters)**
> - CompletionOptions
> - MergeOptions
> - AutoCompleteSetBy.Id
> - TargetRefName …
> Attempting to update other properties outside of this list will either cause
> the server to throw an `InvalidArgumentValueException`, or to silently ignore
> the update.

**Cross-check (Context7, `/websites/learn_microsoft_en-us_rest_api_azure_devops`)**:
"Descriptions are limited to a maximum of 4000 characters."

**Decisions taken from this**:

- `MAX_PR_DESCRIPTION_CHARS = 4000`, with the Learn URL in a comment above it (FR-013).
- The cap is documented on **update**, not on **create** — the create page lists
  `description` as a plain `string` with no `maxLength`. Same field, same
  server-side validation, so the pre-flight applies it to `pr open`. Recorded as
  an inference, not a documented fact; the enriched 400 handler is the backstop
  if a tenant ever disagrees.
- **Title**: no `maxLength` on either page. No title pre-flight (out of scope).
- **Read-side truncation**: an earlier note on the issue claimed the list
  endpoints truncate `description` to 400 characters. That could **not** be
  confirmed on Learn — the only related parameter, `maxCommentLength`, is
  documented as "Not used" — so it is deliberately left out of the docs rather
  than asserted from memory.

## 2. Where the response body is currently lost

`src/services/azdo-client.ts:51` `fetchWithErrors`:

- reads the body **only** when a trace writer is active, via `response.clone()`,
  and writes it to the trace file;
- throws `AUTH_FAILED` (401), `PERMISSION_DENIED` (403), `NOT_FOUND | url=… |
  body=…` (404), and `AUTH_FAILED` for a `text/html` content type;
- **returns** every other response — including 400 and 5xx — to the caller.

18 call sites then do ``if (!response.ok) throw new Error(`HTTP_${response.status}`)``
across `azdo-client.ts`, `pr-client.ts`, `relations-client.ts`,
`pipeline-client.ts`.

## 3. Rejected approach: "make `fetchWithErrors` throw on every non-ok status"

This was the shape posted on the issue at plan time. Plan reconnaissance against
the code shows it **regresses** existing behaviour:

`azdo-client.ts` has six `if (response.status === 400)` branches (lines 269, 299,
399, 521, 594, 707) that read the body **after** `fetchWithErrors` returns and
throw curated `BAD_REQUEST:` / `CREATE_REJECTED:` / `UPDATE_REJECTED:` errors —
which `handleCommandError` renders as "Request rejected: …" / "Update rejected: …".
Those are already body-surfacing errors and they are asserted by existing tests.
Throwing inside `fetchWithErrors` would make all six unreachable and silently
change their wording.

## 4. Chosen approach: capture once in `fetchWithErrors`, format at the throw site

- `fetchWithErrors` reads the body of **every non-ok response** exactly once (via
  `response.clone()`, reusing the text the trace writer already read when
  tracing is on), renders the detail, and stores it in a module-level
  `WeakMap<Response, string>`. The original response reaches the caller with its
  stream intact, so the curated 400 branches keep working.
- 401/403 throw `AUTH_FAILED: <detail>` / `PERMISSION_DENIED: <detail>` using
  that detail. 404 keeps its existing `NOT_FOUND | url=… | body=…` shape (callers
  such as the PR-template probe match on the `NOT_FOUND` prefix).
- A new **synchronous** exported helper `httpError(response)` returns
  `new Error('HTTP_<status>[: <detail>]')` by looking the response up in the
  WeakMap. The 18 throw sites become `throw httpError(response)` — a mechanical
  edit with no async/`bodyUsed` hazards, and a bare `HTTP_<status>` fallback for
  any response that did not come through `fetchWithErrors`.

Single capture point (satisfying "improves every command, not just `pr`"), no
behaviour change for responses that already had curated handling.

## 5. Sentinel prefix matching (issue Blocker 1 = A)

Twelve exact-equality comparisons must become prefix matches, otherwise
appending a detail strips the curated guidance and, for `pr`, the exit code 4:

| File | Lines |
|---|---|
| `src/commands/pr.ts` | 252, 275 |
| `src/commands/pipeline.ts` | 44, 48 |
| `src/commands/relations.ts` | 71 |
| `src/commands/upsert.ts` | 159, 160, 170, 171 |
| `src/services/command-helpers.ts` | 97, 101 |
| `src/services/pr-client.ts` | 877 (`AUTH_FAILED` → `IDENTITY_SCOPE_MISSING`) |

(The issue listed nine; reconnaissance found three more — `command-helpers.ts`
carries the whole work-item command surface and `pr-client.ts:877` is the
Identity-scope mapping, which would stop firing and regress `pr reviewer add`.)

Existing unit tests use `rejects.toThrow('AUTH_FAILED')`, which is a substring
match in vitest, so appending a detail does not break them.

## 6. Redaction and truncation (Q4)

`redactBody` already exists in `src/services/trace-writer.ts` and is applied to
trace output. The detail reuses it before truncating to 500 characters. The full
body remains available in the trace file, so the console is not the archive.
