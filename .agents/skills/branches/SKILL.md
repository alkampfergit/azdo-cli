---
name: branches
description: >
  Manage local repository branches. Use when the user wants to clean up branches,
  verify speckit branches are merged, or maintain branch hygiene. Supports pruning
  stale local branches that have been squash-merged into develop.
---

# Branches Skill

This skill handles repository branch lifecycle management, focusing on keeping the
local branch list clean and in sync with the remote.

## When to use this skill

| User says... | Action |
|---|---|
| "verify spec branch" / "clean branches" / "prune branches" | [Verify Spec Branches](#verify-spec-branches) |

---

## Verify Spec Branches

Identifies local speckit feature branches (named `NNN-*`) that have already been
squash-merged into `develop`, confirms their remote is gone, and deletes them locally.
After cleanup, pulls the latest `develop`.

### Steps

#### 1. Fetch and prune

Run:
```
git fetch --prune
```

This removes remote-tracking refs for branches deleted on origin.

#### 2. Find local speckit branches

List local branches matching the pattern `^\d{3}-` (three leading digits followed by a hyphen):
```
git branch --list | grep -E '^\s*\d{3}-'
```

Collect each branch name (strip leading whitespace/asterisk).

#### 3. For each candidate branfch

**3a. Check remote is gone**

After the fetch --prune, check whether `origin/<branch>` still exists:
```
git branch -r | grep "origin/<branch>"
```

If the remote still exists, skip this branch — do not delete it.

**3b. Check develop contains a squash-merge commit**

A squash-merge produces a single commit on `develop` whose message typically starts
with the branch name or PR title referencing the branch. Use:
```
git log origin/develop --oneline | grep -i "<branch-name-without-prefix>"
```

Also check the standard squash message pattern `Squashed commit` or the branch name:
```
git log origin/develop --oneline --grep="<branch-name>"
```

If no matching commit is found in `develop`, skip this branch — it may not be merged yet.

**3c. Safety check: branch must be fully contained in develop**

As a final safety gate, verify every commit on the candidate branch is reachable from `origin/develop`:
```
git log <branch>..origin/develop --oneline
```

If this returns nothing (empty), it means develop is NOT ahead of the branch — skip.

Actually use the inverse: check `git log origin/develop..<branch>` — if this is empty, the branch is fully merged/squashed into develop.

Wait — for squash merges, individual commits won't appear. So rely on steps 3a + 3b (remote gone + commit message match) as the definitive signal.

**3d. Delete the local branch**

```
git branch -d <branch>
```

Use `-d` (safe delete). If git refuses (because it thinks it's unmerged due to squash), use `-D` only after both 3a and 3b conditions are confirmed.

#### 4. Report results

Print a summary:
- Branches deleted: list each one
- Branches skipped: list each one with reason (remote still exists / no matching commit in develop)
- If no speckit branches found: say so

#### 5. Pull develop

Switch to `develop` and pull:
```
git checkout develop
git pull origin develop
```

Report the result (up to date, or commits pulled).

### Important rules

- Never delete a branch if its remote still exists (step 3a failed)
- Never delete a branch if no matching commit is found in `develop` (step 3b failed)
- Always run `git fetch --prune` first — do not skip this
- Use `-D` (force) only when both 3a and 3b are confirmed true
- Do not delete the currently checked-out branch — skip it with a note
- Do not delete `develop`, `master`, or `main` regardless of pattern matching
