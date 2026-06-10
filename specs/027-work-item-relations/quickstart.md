# Quickstart: Work Item Relations

**Branch**: `027-work-item-relations`
**Date**: 2026-06-10

---

## Scenario 1: Discover what relation types are available

```bash
azdo relations types
```

Expected output:
```
Available work item relation types:

Child                   System.LinkTypes.Hierarchy-Forward
Parent                  System.LinkTypes.Hierarchy-Reverse
Related                 System.LinkTypes.Related
Successor               System.LinkTypes.Dependency-Forward
Predecessor             System.LinkTypes.Dependency-Reverse
Duplicate               System.LinkTypes.Duplicate-Forward
Duplicate Of            System.LinkTypes.Duplicate-Reverse
```

Machine-readable:
```bash
azdo relations types --json | jq '.[].name'
```

---

## Scenario 2: Make work item 2000 a child of work item 1000

```bash
azdo relations add child 1000 2000
```

Expected output:
```
Added relation: #1000 --[Child]--> #2000
```

Running the same command again (idempotent):
```
Relation already exists: #1000 --[Child]--> #2000
```

---

## Scenario 3: Remove the child relation

```bash
azdo relations remove child 1000 2000
```

Expected output:
```
Removed relation: #1000 --[Child]--> #2000
```

If the relation doesn't exist:
```
No relation of type 'Child' found between #1000 and #2000
```

---

## Scenario 4: See all relations on a work item

```bash
azdo relations list 1000
```

Expected output:
```
Relations for work item #1000:

[Child]    #2000  Implement login UI
[Child]    #2001  Write unit tests
[Parent]   #999   Epic: Authentication
```

No relations:
```
Work item #1000 has no relations.
```

---

## Scenario 5: Integration test setup

Integration tests target the `gianmariaricci/azdocli` org. Required test data:
- At least one work item with an existing child/parent relation pair (for list/remove read path)
- Two work items usable as add/remove targets (self-healing: add then remove in the test)

Environment variables needed:
- `AZDO_PAT` — must have `vso.work_write` scope for add/remove tests
- `AZDO_WI_WITH_RELATIONS` — work item ID that has at least one existing relation (for list read-path test)
- `AZDO_WI_RELATION_SOURCE` and `AZDO_WI_RELATION_TARGET` — a pair of IDs for self-healing add/remove round-trip test
