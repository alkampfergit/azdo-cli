---
name: gitflow
description: Drive a gitflow release end-to-end — resolve the current version from the latest tag on master, compute the next version (minor bump by default, or caller-specified), run `git flow release start/finish`, and push `master`, `develop`, and the new tag. Use when the user says "release X.Y.Z", "cut a release", or when speckit-full picks up a release issue.
disable-model-invocation: false
---

# gitflow — automated gitflow release flow

Turn a "please release" request into a completed gitflow release: new tag
on `master`, merges back into `develop`, all pushed to origin. Uses the
`git flow` AVH CLI (`git flow release start/finish`) rather than hand-rolled
merges.

**Sibling skills:** `gh-cli-guide` (if an accompanying GitHub Release is
requested — otherwise stay out of GitHub).

## What this skill does (and does NOT do)

Does:
- Resolve the current version from the most recent tag on `master`.
- Compute the next version (default: bump the middle number = minor).
- Create `release/<x.y.z>` via `git flow release start`.
- Finish it via `git flow release finish` (merges into `master`, tags, merges
  back into `develop`, deletes the release branch).
- Push `master`, `develop`, and the new tag to `origin`.

Does NOT:
- Create a GitHub Release, write release notes, or upload assets. Stop at
  "tag pushed". If the caller wants a GitHub Release too, they ask
  explicitly and you add one step using `gh release create <tag>`.
- Bump versions in source files (package.json, pyproject.toml, `.csproj`,
  etc.) unless the caller names the file(s) and the bump rule. Release
  branches often do this, but it's project-specific; don't guess.
- Force-push. Ever. If a push is rejected, stop and surface the conflict.
- Run on dirty trees, detached HEAD, or non-`develop` start points.

## Required / optional args

- `version` (optional) — explicit target version, e.g. `1.4.0` or `v1.4.0`.
  If omitted, compute from the latest tag on `master` by bumping the minor.
- `bump` (optional) — `major` | `minor` | `patch`. Default `minor`. Ignored
  when `version` is set.
- `remote` (optional, default `origin`) — remote to push to.
- `message` (optional) — tag annotation message. Default `"Release <x.y.z>"`.
- `push` (optional, default `true`) — set `false` to stop after the local
  gitflow finish (caller wants to inspect before pushing).

## Preconditions (hard stops — abort if any fails)

1. `git flow version` resolves (AVH edition). If not, stop and tell the
   user to install `git-flow` (on Debian/Ubuntu: `apt-get install git-flow`).
2. Working tree clean: `git status --porcelain` empty.
3. `master` and `develop` both exist locally and track `origin/master`,
   `origin/develop` respectively. Run `git fetch <remote> --tags` first,
   then fast-forward each:
   ```bash
   git checkout master && git pull --ff-only <remote> master
   git checkout develop && git pull --ff-only <remote> develop
   ```
   If either is non-fast-forward, stop — the caller has local commits to
   reconcile.
4. `git flow` is initialised in the repo — `git config --get gitflow.branch.master`
   returns a value. If not, initialise non-interactively with defaults:
   ```bash
   git flow init -d
   ```
   and tell the user the defaults were used (`master`/`develop`, no
   version prefix, `release/` / `hotfix/` / `feature/` namespaces).
5. No existing `release/*` branch locally or on `<remote>` — having two
   concurrent releases is out of scope. If one exists, stop and surface it.

## Version resolution

```bash
LATEST_TAG=$(git -c versionsort.suffix=-rc -c versionsort.suffix=-beta \
  tag --list --merged master --sort=-v:refname | head -n1)
```

- If `LATEST_TAG` is empty, the repo has never been released. Require the
  caller to pass `version` explicitly — don't invent `0.1.0`.
- Strip a leading `v` if present: `1.2.3`.
- Parse `X.Y.Z` with a regex. If the tag does not match `^\d+\.\d+\.\d+$`
  (e.g. it's `1.2` or `1.2.3-rc1`), stop and ask the caller for `version`.
- Apply `bump`:
  - `major` → `X+1.0.0`
  - `minor` → `X.Y+1.0` (default)
  - `patch` → `X.Y.Z+1`
- If the computed/supplied version tag already exists (`git rev-parse <tag>`
  succeeds), stop.

Preserve the original tag prefix (with or without `v`) — whatever the
previous tag used, use the same. If the repo has no prior tag and the
caller passes `version` without a prefix, use no prefix; with `v`, use `v`.

## Release flow (the actual work)

Assume version `X.Y.Z` and tag `TAG = [v]X.Y.Z`.

```bash
# 1. Start release branch from develop
git checkout develop
git flow release start X.Y.Z
# → now on release/X.Y.Z

# 2. (Optional) caller-specified version-bump commits happen here.
#    If the caller did not ask for any, skip straight to finish.

# 3. Finish: merges release/X.Y.Z into master, tags TAG, merges back into
#    develop, deletes the release branch. -m sets the tag message; -p
#    would push (we push manually below so failures are easier to see).
GIT_MERGE_AUTOEDIT=no git flow release finish -m "<message>" X.Y.Z
```

Notes on `git flow release finish` flags:
- `-m "<msg>"` — annotated-tag message. Without it, `git flow` opens `$EDITOR`.
- `GIT_MERGE_AUTOEDIT=no` — suppresses the editor on the two merges.
- Do NOT pass `-p` (push) here; push in a separate explicit step below so
  a push failure does not leave the caller wondering whether the tag was
  created locally.
- Do NOT pass `-k` (keep branch) unless the caller explicitly asks.

After finish, you should land on `develop`. Verify:
```bash
git rev-parse --abbrev-ref HEAD   # → develop
git tag --list <TAG>               # → <TAG>
```

## Push step

Only if `push=true` (default):

```bash
git push <remote> master
git push <remote> develop
git push <remote> <TAG>
```

Three separate pushes (not `--all` / `--tags`) so a hook rejection is
attributed to the right ref. Never `--force`.

If any push is rejected (non-fast-forward, protected branch, hook
failure), STOP. Do not retry, do not rewrite, do not delete the local
tag. Report the exact stderr to the caller and let them resolve it.

## Rollback guidance (surface to caller on failure)

The skill itself does not auto-rollback — it just reports. If something
goes wrong mid-flow, the caller may want to know:

- Before `release finish`: `git flow release delete X.Y.Z` (or
  `git checkout develop && git branch -D release/X.Y.Z`).
- After `release finish` but before push: the tag and merges exist
  locally. To undo, reset `master` to `origin/master`, reset `develop`
  to `origin/develop`, and `git tag -d <TAG>`. Destructive — only on
  caller say-so.
- After push: rolling back a pushed tag/branch affects every consumer.
  Do not do it from this skill. Escalate to the caller.

## Output contract

On success, emit a single compact summary the caller can quote back:

```
Released <TAG>
  master:  <short-sha-before> → <short-sha-after>
  develop: <short-sha-before> → <short-sha-after>
  tag:     <TAG> (pushed to <remote>)
```

On any abort, emit the precondition/step that failed and the exact command
output. Do not paper over.

## Example invocations

- `/gitflow` — infer version from latest tag on master, bump minor, push.
- `/gitflow bump=patch` — latest + patch bump.
- `/gitflow version=2.0.0 message="2.0 — new CLI"` — explicit version and tag message.
- `/gitflow version=1.3.0 push=false` — do the flow locally; caller inspects before pushing.
