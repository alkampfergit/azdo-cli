# Contract — `org-resolver` service

Public surface of `src/services/org-resolver.ts` (new).

## Types

```ts
export interface ResolveOrgOptions {
  org?: string;       // from --org flag
  readConfig?: () => { org?: string };   // injectable for tests
  detectFromGit?: () => string | null;   // injectable for tests; wraps git-remote.detectAzdoContext().org
}

export type OrgSource = 'flag' | 'git' | 'config';

export interface ResolvedOrg {
  org: string;
  source: OrgSource;
}
```

## Functions

### `resolveOrg(options: ResolveOrgOptions): ResolvedOrg | null`

Returns the first of:

1. `options.org` → `{ org: options.org, source: 'flag' }`
2. `options.detectFromGit?.()` → `{ org: <detected>, source: 'git' }`
3. `options.readConfig?.().org` → `{ org: <configured>, source: 'config' }`
4. `null`.

No prompting, no network. Pure function (modulo the injected readers).

### `formatResolutionError(): string`

Returns a canned diagnostic listing each resolution step and how to satisfy it. Used by callers when `resolveOrg(...) === null`.

Example output:

```text
Could not resolve an Azure DevOps organization. Options (in priority order):
  1. Pass --org <name> on the command line.
  2. Run this command from a git repo whose origin remote is an Azure DevOps URL.
  3. Run `azdo config set org <name>` once to set a persistent default.
```

## Invariants

- Never reads the OS vault.
- Never emits to stdout/stderr.
- Fully testable without touching the filesystem or git (via the injected readers).
