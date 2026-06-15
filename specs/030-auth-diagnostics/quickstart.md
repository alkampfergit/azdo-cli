# Quickstart: Auth Diagnostics

## Scenario 1 — Diagnose a failing PAT

```bash
# Store a PAT (or it may already be stored from a previous auth)
azdo auth login --org myorg --use-pat

# Run the diagnostic
azdo auth diagnose --org myorg
```

Expected output when PAT scope is wrong:
```
Auth type:   PAT
Source:      credential-store
Org:         myorg
Project:     (not set)
Connectivity: FAILED
Error:       TF400813: The user '...' is not authorized to access this resource.
```

Expected output when PAT is valid:
```
Auth type:   PAT
Source:      credential-store
Org:         myorg
Project:     (not set)
Connectivity: OK
```

## Scenario 2 — Diagnose with environment variable PAT

```bash
export AZDO_PAT=mypatvalue
azdo auth diagnose --org myorg
```

Expected output:
```
Auth type:   PAT
Source:      env:AZDO_PAT
Org:         myorg
Project:     (not set)
Connectivity: OK   # or FAILED with error detail
```

## Scenario 3 — No credentials stored

```bash
azdo auth diagnose --org myorg
```

Expected output (exit code 0, no crash):
```
Auth type:   none
Source:      (none)
Org:         myorg
Connectivity: no credentials found
```

## Scenario 4 — Trace a command to investigate API errors

```bash
# Run a failing command with full HTTP trace
azdo --trace /tmp/azdo-trace.log get-item 44119

# Inspect the trace (credentials are redacted)
cat /tmp/azdo-trace.log
```

Expected trace file content (excerpt):
```json
{"timestamp":"2026-06-15T19:00:00.000Z","method":"GET","url":"https://dev.azure.com/myorg/myproject/_apis/wit/workitems/44119?api-version=7.1","requestHeaders":{"Authorization":"[REDACTED]"},"requestBody":null,"responseStatus":401,"responseHeaders":{},"responseBody":"{\"$id\":\"1\",\"innerException\":null,\"message\":\"TF400813...\"}"}
```

## Scenario 5 — JSON output for scripting

```bash
azdo auth diagnose --org myorg --json
```

Expected output:
```json
{
  "authType": "pat",
  "credentialSource": "credential-store",
  "org": "myorg",
  "project": null,
  "connectivityStatus": "failed",
  "connectivityError": "TF400813: The user '...' is not authorized to access this resource."
}
```
