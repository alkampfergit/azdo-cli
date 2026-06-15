# Data Model: Auth Diagnostics

## AuthDiagnosticReport

The structured result of `azdo auth diagnose`.

| Field | Type | Description |
|-------|------|-------------|
| `authType` | `'pat' \| 'oauth' \| 'none'` | Active credential kind |
| `credentialSource` | `string \| null` | Where the credential was loaded from (e.g. `'env:AZDO_PAT'`, `'credential-store'`, `null` if none found) |
| `org` | `string` | Configured Azure DevOps organisation |
| `project` | `string \| null` | Configured project (if set) |
| `connectivityStatus` | `'ok' \| 'failed' \| 'no-credentials'` | Result of the scope-aware connectivity test |
| `connectivityError` | `string \| null` | Exact API error message when `connectivityStatus` is `'failed'`; `null` otherwise |

## TraceEntry

One HTTP exchange written to the trace log.

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | `string` | ISO-8601 UTC timestamp of the request |
| `method` | `string` | HTTP method (e.g. `GET`, `POST`) |
| `url` | `string` | Full request URL |
| `requestHeaders` | `Record<string, string>` | Request headers with credential values replaced by `[REDACTED]` |
| `requestBody` | `string \| null` | Request body text (or `null` if absent) |
| `responseStatus` | `number` | HTTP response status code |
| `responseHeaders` | `Record<string, string>` | Response headers |
| `responseBody` | `string` | Response body text |

### Redaction rules

The following values are replaced with `[REDACTED]` before writing:
- `Authorization` header value (any scheme)
- Any header whose name matches `/^x-.*token$/i`
- Any URL query parameter named `token` or `pat`
- Any JSON body field named `token`, `accessToken`, or `pat` (top-level only)
