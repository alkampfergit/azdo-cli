# Data Model: 037-api-error-surfacing

No persisted state. Two in-memory shapes.

## `ComposedDescription` (`src/types/pull-request.ts`)

The result of joining the operator's `--description` with the repository PR
template, carrying the arithmetic so the caller never re-measures.

| Field | Type | Notes |
|---|---|---|
| `text` | `string` | The composed description actually sent to Azure DevOps. |
| `providedChars` | `number` | Length of the operator's `--description` (0 when omitted). |
| `separatorChars` | `number` | 2 (`\n\n`) when both parts are present, else 0. |
| `templateChars` | `number` | Length of the template content (0 when no template resolved). |
| `templatePath` | `string \| null` | Repository path of the resolved template, for the error message. |
| `totalChars` | `number` | `text.length` — the number compared against the limit. |

Invariant: `totalChars === providedChars + separatorChars + templateChars`.

## Failure detail (internal, `src/services/azdo-client.ts`)

A `string | null` derived from a non-2xx response body and stored in a
`WeakMap<Response, string>` keyed by the response object, so the error thrown
for a response can name the body without re-reading the stream.

Derivation order:

1. empty body → `null`
2. `text/html` content type, or body starting with `<` → `null` (never echo the AAD sign-in page)
3. `redactBody(body)`, then `JSON.parse`:
   - `message` present → `message`
   - `typeKey` / `errorCode` present → appended as `[typeKey]` / `[errorCode]`
   - neither → fall through
4. unparseable or no usable field → first 200 characters of the redacted raw body
5. result truncated to 500 characters with an explicit `…(truncated)` marker

## Constants

| Name | Value | Source |
|---|---|---|
| `MAX_PR_DESCRIPTION_CHARS` | `4000` | Learn: `rest/api/azure/devops/git/pull-requests/update` — "Description (up to 4000 characters)" |
| `MAX_DETAIL_CHARS` | `500` | Issue #95 clarify Q4 |
| `MAX_RAW_BODY_CHARS` | `200` | Issue #95 clarify Q4 |
