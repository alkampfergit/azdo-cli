# Research: Work Item Relations Support

**Branch**: `027-work-item-relations`
**Date**: 2026-06-10
**Sources**: Microsoft Learn REST API docs (api-version 7.1)

---

## R1: List Relation Types

**Decision**: Use `GET /{org}/_apis/wit/workitemrelationtypes?api-version=7.1`

**Key findings**:
- Scope is **organisation-wide**, not project-scoped (spec said "project/organisation" — organisation is accurate)
- Returns `WorkItemRelationType[]`, each with:
  - `referenceName` — stable full name, e.g. `System.LinkTypes.Hierarchy-Forward`
  - `name` — human-readable display name, e.g. `Child`
  - `attributes.usage` — `workItemLink` (what we care about) vs `resourceLink` (attachments, hyperlinks, artifact links — exclude from the `types` listing as users cannot use these for work item relations)
  - `attributes.enabled` — whether the type is enabled
- Required PAT scope: `vso.work` (Work Items → Read)
- No auth redirect — returns 401 on bad PAT

**Alias resolution**: The user types `child`/`parent`/`related` etc. Strategy: at command time, call `workitemrelationtypes`, match case-insensitively against the `name` field (display name), then use the matched `referenceName` in subsequent API calls. This also validates the type and avoids a hard-coded alias table.

---

## R2: Add a Relation

**Decision**: Use `PATCH /{org}/{project}/_apis/wit/workitems/{id}?api-version=7.1` with JSON Patch body

**Key findings**:
- Content-Type MUST be `application/json-patch+json`
- Relation add operation:
  ```json
  [
    {
      "op": "add",
      "path": "/relations/-",
      "value": {
        "rel": "<referenceName>",
        "url": "https://dev.azure.com/{org}/_apis/wit/workItems/{target_id}"
      }
    }
  ]
  ```
- The `url` field is the canonical work item URL (org-scoped, NOT project-scoped)
- Required PAT scope: `vso.work_write` (Work Items → Read & Write)
- ADO does NOT reject duplicate relation adds — it silently creates a duplicate. Idempotency must be enforced client-side by checking existing relations before patching.

**Idempotency implementation**: Before adding, fetch the source work item with `$expand=relations` and check whether any existing relation matches the (referenceName, target URL) pair. If found, return success without calling PATCH.

---

## R3: Remove a Relation

**Decision**: Use the same `PATCH` endpoint with a `remove` operation

**Key findings**:
- Removal requires the **array index** of the relation in the work item's `relations` array:
  ```json
  [
    { "op": "remove", "path": "/relations/2" }
  ]
  ```
- This means `remove` is a two-step operation:
  1. `GET /{org}/{project}/_apis/wit/workitems/{id}?$expand=relations` to find the index of the matching relation (match by `rel` + target URL)
  2. `PATCH` with `{"op": "remove", "path": "/relations/{index}"}`
- Required PAT scope: `vso.work_write`

**"Not found" handling**: If the GET returns the work item but no matching relation exists in the array, return a clear "relation not found" message without calling PATCH.

---

## R4: List Relations on a Work Item

**Decision**: Use `GET /{org}/{project}/_apis/wit/workitems/{id}?$expand=relations&api-version=7.1`

**Key findings**:
- Returns the work item with a `relations` array, each item:
  - `rel` — the referenceName of the relation type
  - `url` — the target resource URL (for work item links, encodes the target ID)
  - `attributes` — optional metadata (comment, isLocked, etc.)
- The `url` encodes the target work item ID; parse with `/(\d+)$/.exec(url)`
- Titles of related work items are NOT included — need a second call
- To fetch titles efficiently, use batch fetch:
  `GET /{org}/{project}/_apis/wit/workitems?ids=1,2,3&fields=System.Id,System.Title&api-version=7.1`
- Filter out `resourceLink` relations (Hyperlinks, Attachments, Artifact Links) in the output unless `--all` is passed; focus on `workItemLink` entries by cross-referencing with relation types.

---

## R5: PAT Scope Summary

| Command | Required PAT Scope |
|---------|-------------------|
| `relations types` | `vso.work` |
| `relations list <id>` | `vso.work` |
| `relations add <type> <id1> <id2>` | `vso.work_write` |
| `relations remove <type> <id1> <id2>` | `vso.work_write` |

---

## R6: Alternatives Considered

- **Hard-coded alias map** (child → `System.LinkTypes.Hierarchy-Forward`): Rejected — brittle if an org has custom relation types; also skips validation.
- **Resolving type by `referenceName` directly** (user types full ref name): Rejected — poor UX; the display name (`child`, `parent`) is what users know.
- **Fetching target work item title on every `add` confirmation**: Deferred — unnecessary for confirmation output; ID is sufficient.
