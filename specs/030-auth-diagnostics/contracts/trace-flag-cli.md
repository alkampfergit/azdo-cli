# Contract: Global `--trace <filepath>` flag

## Synopsis

```
azdo --trace <filepath> <command> [options]
```

## Behaviour

- Appends one entry per HTTP request/response to `<filepath>`.
- File is created if it does not exist, with owner-only permissions (Unix: `0600`).
- If the file cannot be opened, a warning is printed to stderr and the command continues normally (non-fatal).
- No trace file is created when `--trace` is omitted.

## Entry format

Each entry is a JSON object on one line (NDJSON), followed by a blank line separator:

```
{"timestamp":"2026-06-15T19:00:00.000Z","method":"GET","url":"https://dev.azure.com/myorg/_apis/projects?api-version=7.1&$top=1","requestHeaders":{"Authorization":"[REDACTED]","Content-Type":"application/json"},"requestBody":null,"responseStatus":200,"responseHeaders":{"content-type":"application/json; charset=utf-8"},"responseBody":"{\"count\":3,\"value\":[...]}"}

```

## Redaction guarantee

- `Authorization` header value → `[REDACTED]`
- Any header matching `/^x-.*token$/i` → `[REDACTED]`
- URL query params `token` or `pat` → `[REDACTED]`
- JSON body top-level fields `token`, `accessToken`, `pat` → `[REDACTED]`

## Examples

```bash
# Trace a failing work-item fetch
azdo --trace /tmp/azdo-trace.log get-item 12345

# Trace auth diagnose
azdo --trace ./debug.log auth diagnose --org myorg
```
