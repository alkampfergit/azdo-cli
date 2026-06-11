# Data Model: Work Item Relations Support

**Branch**: `027-work-item-relations`
**Date**: 2026-06-10

---

## ADO API Response Shapes (raw types to add to `src/types/`)

### `AzdoWorkItemRelationType` (new)

```typescript
// GET /_apis/wit/workitemrelationtypes
interface AzdoWorkItemRelationType {
  referenceName: string;          // "System.LinkTypes.Hierarchy-Forward"
  name: string;                   // "Child"
  attributes?: {
    usage?: string;               // "workItemLink" | "resourceLink"
    enabled?: boolean;
    editable?: boolean;
    directional?: boolean;
    acyclic?: boolean;
    singleTarget?: boolean;
    topology?: string;            // "dependency" | "tree" | "network"
    isForward?: boolean;
    oppositeEndReferenceName?: string;
  };
  url?: string;
}

interface AzdoWorkItemRelationTypeListResponse {
  value: AzdoWorkItemRelationType[];
  count?: number;
}
```

### `AzdoWorkItemRelation` (new)

```typescript
// Embedded in work item GET response when $expand=relations
interface AzdoWorkItemRelation {
  rel: string;         // referenceName, e.g. "System.LinkTypes.Hierarchy-Forward"
  url: string;         // target resource URL, e.g. "https://dev.azure.com/{org}/_apis/wit/workItems/297"
  attributes?: {
    isLocked?: boolean;
    comment?: string;
    [key: string]: unknown;
  };
}
```

### Extended `AzdoWorkItem` (existing — add `relations` field)

The existing `AzdoWorkItem` type in `src/types/work-item.ts` already has basic fields. Add:

```typescript
// Add to existing AzdoWorkItem interface
relations?: AzdoWorkItemRelation[];
```

---

## CLI-Layer Types (to add to `src/types/relations.ts` — new file)

### `WorkItemRelationType` (command output)

```typescript
export interface WorkItemRelationType {
  referenceName: string;
  name: string;
  usage: 'workItemLink' | 'resourceLink' | string;
  enabled: boolean;
  directional: boolean | null;
}
```

### `WorkItemRelation` (command output for `list <id>`)

```typescript
export interface WorkItemRelation {
  rel: string;          // referenceName
  relName: string;      // display name resolved from types, or referenceName if unknown
  targetId: number;
  targetTitle: string | null;   // null when title fetch fails or type is resourceLink
  targetUrl: string;
  comment: string | null;
}
```

### `WorkItemRelationsResult` (top-level result for `list <id>`)

```typescript
export interface WorkItemRelationsResult {
  workItemId: number;
  relations: WorkItemRelation[];
}
```

---

## Key Relationships

```
AzdoWorkItemRelationType (API)
  └── referenceName  ─────────────┐
                                  │ resolves alias → referenceName
AzdoWorkItemRelation (API)        │
  └── rel (referenceName)  ───────┘

WorkItemRelation (CLI output)
  ├── rel            ← AzdoWorkItemRelation.rel
  ├── relName        ← AzdoWorkItemRelationType.name (looked up by referenceName)
  ├── targetId       ← parsed from AzdoWorkItemRelation.url
  └── targetTitle    ← fetched via batch GET /_apis/wit/workitems?ids=...
```

---

## Validation Rules

- `id1 != id2` enforced in the `add` command before any API call
- `referenceName` must match an enabled `workItemLink` type (checked against live types list)
- Case-insensitive match on display name (`Child` == `child` == `CHILD`)
- Target URL for add constructed as: `https://dev.azure.com/{org}/_apis/wit/workItems/{id2}` (org-scoped, not project-scoped)
