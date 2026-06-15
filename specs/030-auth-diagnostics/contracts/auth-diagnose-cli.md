# Contract: `azdo auth diagnose`

## Synopsis

```
azdo auth diagnose [--org <name>] [--project <name>] [--json]
```

## Output (human-readable, default)

```
Auth type:   PAT
Source:      credential-store
Org:         myorg
Project:     (not set)
Connectivity: OK
```

On failure:

```
Auth type:   PAT
Source:      credential-store
Org:         myorg
Project:     (not set)
Connectivity: FAILED
Error:       TF400813: The user 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' is not authorized to access this resource.
```

No credentials found:

```
Auth type:   none
Source:      (none)
Org:         myorg
Connectivity: no credentials found
```

## Output (--json)

```json
{
  "authType": "pat",
  "credentialSource": "credential-store",
  "org": "myorg",
  "project": null,
  "connectivityStatus": "ok",
  "connectivityError": null
}
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Connectivity OK (or no credentials but command itself ran) |
| 1 | Connectivity FAILED or unexpected error |

## Options

| Option | Description |
|--------|-------------|
| `--org <name>` | Override org (default: context resolution) |
| `--project <name>` | Override project (default: context resolution) |
| `--json` | Emit JSON instead of human-readable text |
