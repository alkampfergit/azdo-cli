# Quickstart: Update Work Item

## Prerequisites

- Node.js 18+ installed
- Azure DevOps PAT with **Work Items (Read & Write)** scope
- Organization and project configured (via `azdo config set` or `--org`/`--project` flags)

## Usage

### Change work item state

```bash
azdo set-state 19007 "Active"
# Updated work item 19007: State -> Active

azdo set-state 19007 "Closed" --org myorg --project myproject
# Updated work item 19007: State -> Closed
```

### Assign a work item

```bash
azdo assign 19007 "Gian Maria Ricci"
# Updated work item 19007: Assigned To -> Gian Maria Ricci

azdo assign 19007 --unassign
# Updated work item 19007: Assigned To -> (unassigned)
```

### Set any field

```bash
azdo set-field 19007 System.Title "New title for this item"
# Updated work item 19007: System.Title -> New title for this item

azdo set-field 19007 Microsoft.VSTS.Common.Priority 1
# Updated work item 19007: Microsoft.VSTS.Common.Priority -> 1
```

### JSON output

All commands support `--json` for machine-readable output:

```bash
azdo set-state 19007 "Active" --json
# {"id":19007,"rev":3,"title":"...","field":"System.State","value":"Active"}
```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| Authentication failed | Invalid or expired PAT | Run `azdo clear-pat` and re-enter PAT |
| Permission denied | PAT lacks Write scope | Create PAT with "Work Items (Read & Write)" |
| Work item not found | Invalid ID or wrong org/project | Verify ID and use `--org`/`--project` flags |
| Field update rejected | Invalid state transition or value | Check allowed values for the field in Azure DevOps |
