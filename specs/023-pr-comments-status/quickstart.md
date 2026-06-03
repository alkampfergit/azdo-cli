# Quickstart: Better support for commenting in the pull request (023)

Manual verification steps once implemented. Requires a real Azure DevOps PR
with: at least one passing branch-policy build validation, and a mix of
code-anchored + general comment threads, some resolved.

## 0. Build

```bash
npm run lint && npm test && npm run build
```

## 1. Status checks are surfaced (US1)

```bash
azdo pr status            # on a branch with an open PR that has green policy checks
```

Expect the `Checks:` section to **list the green checks** (policy
evaluations + statuses), NOT `none reported`. Confirm `--json` carries the
same checks with a `source` of `policy` or `status`.

On a PR genuinely without any checks, expect `Checks: none reported by
Azure DevOps`.

## 2. Comment filters (US2)

```bash
azdo pr comments                          # baseline — unchanged from before
azdo pr comments --code-related-only      # only file-anchored threads
azdo pr comments --exclude-resolved       # only unresolved threads (alias of --hide-resolved)
azdo pr comments --code-related-only --exclude-resolved   # unresolved code threads only
```

Verify each filter narrows the output as expected, that the two combine, and
that the no-flag run matches the prior release exactly. Repeat with `--json`.

## 3. Comment counts in status (US3)

```bash
azdo pr status
```

Expect a `Code comments: <open> open, <closed> closed` line counting only
code-anchored threads. Cross-check against
`azdo pr comments --code-related-only` (total) and
`azdo pr comments --code-related-only --exclude-resolved` (open).

## 4. Regression

```bash
npm test    # all existing pr tests stay green; new unit tests pass
```
