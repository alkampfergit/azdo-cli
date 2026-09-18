# Contract: error surfacing and description pre-flight

## C-1 — sentinel shape

Every error thrown by the HTTP layer keeps its sentinel as a **prefix**:

```
AUTH_FAILED[: <detail>]
PERMISSION_DENIED[: <detail>]
HTTP_<status>[: <detail>]
NOT_FOUND | url=<url> | body=<body>        (unchanged)
NETWORK_ERROR[: <cause>]                    (unchanged)
```

`<detail>` is absent when the body is empty or HTML. Consumers MUST match with
`startsWith`, never `===`.

## C-2 — detail rendering

| Body | Detail |
|---|---|
| `{"message":"X"}` | `X` |
| `{"message":"X","typeKey":"T"}` | `X [T]` |
| `{"typeKey":"T"}` | `[T]` |
| `{"errorCode":123}` | `[errorCode 123]` |
| `not json` | `not json` (first 200 chars) |
| `<html>…` or `content-type: text/html` | *(none)* |
| `{"message":"<1000 chars>"}` | first 500 chars + `…(truncated)` |
| body with a sensitive JSON field | field value replaced by `redactBody` before rendering |

The full body is always still written to the trace file when tracing is on.

## C-3 — curated errors are unchanged

`BAD_REQUEST:`, `CREATE_REJECTED:`, `UPDATE_REJECTED:` (400 paths in
`azdo-client.ts`), `NOT_FOUND`, `IDENTITY_SCOPE_MISSING`, `DESCRIPTION_REQUIRED`,
`AMBIGUOUS_PRS:` keep their exact current wording, and `pr` exit codes stay
`0 / 1 / 3 / 4`.

## C-4 — command output layout

```
Error: <curated guidance>
  <server detail>            # only when a detail exists
```

## C-5 — `pr open` description pre-flight

Rejected before any create request when
`provided + separator + template > 4000`:

```
Error: description is 4172 characters (2299 provided + 2 separator + 1871 from the
repository pull request template .azuredevops/pull_request_template.md), exceeding
the Azure DevOps limit of 4000 characters. Shorten the description by at least 172
characters.
```

Without a template:

```
Error: description is 4500 characters, exceeding the Azure DevOps limit of 4000
characters. Shorten the description by at least 500 characters.
```

Exit code 1 (validation failure). Exactly 4000 characters is accepted.

## C-6 — 400 backstop on `pr open`

When the create request is rejected with a 400 despite the pre-flight, the
thrown error is:

```
HTTP_400: <server message> [<typeKey>] | description: 2299 provided + 2 separator +
1871 template = 4172 characters (client limit 4000)
```
