# Data Model: 026-fix-pr-build-status

## Changed Types

### `PullRequestCheck` (src/types/pull-request.ts)

Extends the existing interface with two new fields:

```typescript
export interface PullRequestCheck {
  id: number;
  state: string;         // pending | succeeded | failed | error | <pass-through>
  name: string;
  description: string | null;
  targetUrl: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  source?: 'status' | 'policy' | 'build';  // 'build' is new
  isBlocking?: boolean | null;              // NEW — null/undefined = unknown, false = optional
}
```

**isBlocking semantics:**
- `true` — required check; a failure blocks merge (from policy `configuration.isBlocking`)
- `false` — optional/informational check; failure does NOT block merge
- `null` / `undefined` — unknown (build-source checks have no policy info)

**Formatter rule:** show `[optional]` suffix only when `isBlocking === false`; no tag otherwise.

---

### `AzdoBuild` (src/types/pipeline.ts)

Add `name` to the `definition` sub-object (currently only `id` is present):

```typescript
export interface AzdoBuild {
  // ...existing fields...
  definition?: { id?: number; name?: string };  // name is new
}
```

---

### `AzdoPolicyEvaluation` (src/types/pull-request.ts)

Add `context` field for deduplication with the Builds API:

```typescript
export interface AzdoPolicyEvaluation {
  evaluationId?: string;
  status?: string;
  configuration?: {
    id?: number;
    isBlocking?: boolean;
    type?: { id?: string; displayName?: string };
    settings?: { displayName?: string };
  };
  context?: { buildId?: number };  // NEW — links policy eval to a specific build run
}
```

---

## New Functions

### `getPullRequestBuilds` (src/services/pr-client.ts)

```typescript
export async function getPullRequestBuilds(
  context: AzdoContext,
  cred: AuthCredential,
  prId: number,
): Promise<PullRequestCheck[]>
```

Calls `GET /_apis/build/builds?branchName=refs/pull/{prId}/merge&queryOrder=queueTimeDescending&$top=50&api-version=7.1`.

Maps each `AzdoBuild` to a `PullRequestCheck` with `source: 'build'` and `isBlocking: null`.

**State mapping:**

| `build.status` | `build.result` | `PullRequestCheck.state` |
|---|---|---|
| `notStarted`, `postponed` | any | `pending` |
| `inProgress`, `cancelling` | any | `pending` |
| `completed` | `succeeded`, `partiallySucceeded` | `succeeded` |
| `completed` | `failed` | `failed` |
| `completed` | `canceled` | `error` |
| `completed` | `none` / absent | `pending` |
| other | any | `pending` |

**Name:** `build.definition?.name ?? build.buildNumber ?? `Build #${build.id}``

---

## Changed Functions

### `mapPolicyEvaluationCheck` (src/services/pr-client.ts)

Existing function extended to set `isBlocking` on the returned `PullRequestCheck`:

```typescript
return {
  // ...existing fields...
  isBlocking: evaluation.configuration?.isBlocking ?? null,
};
```

### `buildPullRequestStatusEntry` (src/commands/pr.ts)

Extended with a third source:

```typescript
let buildChecks: PullRequestCheck[] = [];
let buildsOk = true;
try {
  const allBuilds = await getPullRequestBuilds(context, repo, cred, pullRequest.id);
  // Exclude builds already linked by a policy evaluation (deduplication).
  const policyBuildIds = new Set(
    policyEvaluationRaw.map(e => e.context?.buildId).filter((id): id is number => id != null)
  );
  buildChecks = allBuilds.filter(c => !policyBuildIds.has(c.id));
} catch {
  buildsOk = false;
}

const checks = [...statusChecks, ...policyChecks, ...buildChecks];
const checksError =
  checks.length === 0 && (!statusOk || !policyOk || !buildsOk)
    ? 'Azure DevOps request failed'
    : null;
```

> **Note**: `buildPullRequestStatusEntry` needs to retain the raw `AzdoPolicyEvaluation[]` before mapping to extract `context.buildId` for deduplication. This requires a small refactor: capture the raw response from `getPullRequestPolicyEvaluations` before mapping.

### `formatPullRequestChecks` (src/commands/pr.ts)

Extended to show `[optional]` suffix:

```typescript
for (const check of checks) {
  const optionalTag = check.isBlocking === false ? ' [optional]' : '';
  lines.push(`- [${check.state}] ${check.name}${optionalTag}`);
  // ...
}
```

---

## New Integration Test Variables

| Variable | Purpose | Example value |
|---|---|---|
| `AZDO_PR_ID_WITH_BUILDS` | PR ID known to have at least one pipeline run | `65` |
