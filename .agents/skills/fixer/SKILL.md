---
name: fixer
description: Repair common "repo is not in a clean state" situations so another skill (e.g. `speckit-full`) can proceed. Use when the caller reports pending/uncommitted changes on develop/master, a branch that hasn't been pushed, or a push that was rejected because the remote has newer commits. Does NOT touch state that looks intentional (merge in progress, detached HEAD, untracked files that look like secrets, etc.) — surfaces those to the user instead.
disable-model-invocation: false
---

# fixer — auto-heal a dirty working tree for automation

When an automation skill (typically `speckit-full` or `speckit-gh`) finds
the repository in a state that violates its preconditions, it delegates to
this skill in a subagent to bring the tree back to "clean, on base branch,
pushed" so the next cycle can proceed.

The fixer is **local-first, non-destructive, and fully autonomous**:

- **Never asks the user anything.** The fixer runs in a subagent and has
  no user channel. It either applies a rule and reports back to the
  caller, or it stops and reports "skipped" with a reason. If a decision
  looks like it needs a human, the correct answer is to stop and let the
  caller surface it — never prompt, never open a chat question, never
  wait on input.
- **Never reverts code.** No `git reset --hard`, no `git checkout --
  <file>`, no `git restore`, no `git stash drop`, no `git clean -f`, no
  discarding uncommitted edits, no reverting committed work. Pending
  changes are committed (or moved to a feature branch and committed),
  never thrown away. If the only way forward would destroy work, stop
  and report.
- **Never force-pushes**, never skips hooks, never rewrites already-pushed
  history.

If a situation doesn't match one of the rules below, the fixer stops and
returns the single-line summary to the caller — which then relays it to
the main prompt / user.

## Inputs (optional)

- `repo` — `owner/name` for logging only; the fixer operates on the
  current working tree.
- `base-branch` — default base to test "on develop/master" against.
  Defaults to the repo's default branch via
  `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`,
  falling back to `develop` then `master`.
- `reason` — free-text hint from the caller about what triggered the
  fixer (e.g. "pending changes on develop before loop cycle"). Used in
  the commit message / report only.

## Rules

Apply the first rule that matches. Each rule is self-contained.

### Rule 1 — Pending changes on a feature branch

**Trigger:** `git status --porcelain` is non-empty AND the current branch
is NOT `develop` / `master` / `main`.

**Action:**
1. Inspect changes: `git status --short`, `git diff`, `git diff --cached`,
   and list untracked files.
2. Compose a concise commit message (1 line, under 70 chars, imperative
   mood) summarising the changes. Favour the *why* if obvious from the
   diff; otherwise describe the scope (e.g. `update fixer skill docs`,
   `wire precondition repair into speckit-full`). Do NOT mention the
   `fixer` skill itself in the message — the message reflects what the
   code changed, not how it got committed.
3. Stage the files you mean to commit. Prefer explicit `git add <paths>`
   over `git add -A` so you don't sweep in stray artifacts. Skip files
   that look like secrets (`.env*`, `*credentials*`, `*.pem`, `id_rsa*`,
   `*.kubeconfig`) — if any are present, stop and report.
4. Commit with a HEREDOC message:
   ```bash
   git commit -m "$(cat <<'EOF'
   <subject line>

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```
5. Push with `git push` (or `git push -u origin <branch>` if the branch
   has no upstream). On push rejection due to non-fast-forward, jump to
   **Rule 3**.

### Rule 2 — Pending changes on develop / master / main

**Trigger:** `git status --porcelain` is non-empty AND the current branch
IS `develop`, `master`, or `main`.

**Action:**
1. Do NOT commit on the base branch. Automation is not allowed to push
   straight to shared integration branches.
2. Inspect the diff (same as Rule 1, step 1) and derive a short kebab-case
   slug (3–5 words, lowercase, dashes) describing the change — e.g.
   `fixer-skill-scaffold`, `precondition-repair-wiring`. Prefer nouns
   over verbs; keep it ≤ 40 chars.
3. Create and switch to `feature/<slug>`:
   ```bash
   git checkout -b feature/<slug>
   ```
   The uncommitted changes ride along automatically — `git checkout -b`
   preserves the working tree.
4. From the new branch, follow **Rule 1** steps 3–5 to stage, commit, and
   push (including `-u origin feature/<slug>`).
5. Leave the caller on the new feature branch. Report the branch name
   back so the caller knows it must switch back to the base branch before
   retrying its preconditions.

### Rule 3 — Push rejected because remote has newer commits

**Trigger:** `git push` exits non-zero with a message containing
`non-fast-forward`, `fetch first`, or `rejected` / `Updates were rejected`.

**Action:**
1. `git pull --rebase` (never `--no-rebase`, never `--ff-only` that would
   just fail again).
2. If the rebase succeeds cleanly, re-run `git push`. Done.
3. If the rebase reports conflicts:
   a. Run `git status` to enumerate conflicted paths.
   b. For each conflicted file, read both sides (`git show :2:<path>`
      and `git show :3:<path>`) plus the working-tree version, and
      produce a merged version that preserves the intent of both
      changes. Do not auto-pick one side without inspecting what was
      dropped.
   c. `git add <resolved-paths>` then `git rebase --continue`. Repeat
      until the rebase finishes.
   d. If at any point the resolution is non-obvious (semantic conflicts
      you can't confidently reconcile, binary conflicts, lockfile
      churn that needs regeneration), run `git rebase --abort` and
      stop — report the conflicted paths to the caller. Do NOT leave
      the repo mid-rebase.
4. After the rebase lands, `git push`. If this push is rejected again,
   stop and report — two rejections in a row means someone else is
   actively pushing; let the caller decide.

## What the fixer will NOT do

- Ask the user anything, ever. No chat prompts, no console questions, no
  waiting on input. The fixer is a subagent tool and has no user channel.
- Revert, discard, or throw away code. No `git reset --hard`,
  `git checkout -- <file>`, `git restore`, `git clean -f`, `git stash
  drop`, `git revert`, or any other operation that would drop
  uncommitted or committed work. If repair would require destroying
  code, stop and report.
- Force push (`git push --force` / `--force-with-lease`) — ever.
- Skip hooks (`--no-verify`) or bypass signing (`--no-gpg-sign`). If a
  hook fails, surface the hook output and stop.
- Touch a repo in the middle of a merge, rebase, cherry-pick, or bisect
  (`.git/MERGE_HEAD`, `.git/rebase-merge`, `.git/CHERRY_PICK_HEAD`, etc.
  present). Those are the user's in-progress operations — report and
  stop.
- Commit when `HEAD` is detached. Report and stop.
- Commit files that look like secrets (see Rule 1 step 3).
- Create a PR, touch labels, or comment on issues — those belong to the
  caller. The fixer only manipulates git state.
- Auto-install missing tooling (`git-flow`, language toolchains, etc.).
- Run tests or linters beyond what the pre-commit hook already runs.

## Output contract

The fixer's only output is a single-line structured summary returned to
the caller (which is the orchestrating skill's main prompt). The caller
is responsible for relaying that line to the user if needed — the fixer
itself never talks to the user directly.

```
fixer: <rule-applied> | branch=<branch> | commit=<sha|none> | pushed=<yes|no|failed> | note=<one-line>
```

Examples:
- `fixer: rule-1 | branch=feature/foo | commit=abcd123 | pushed=yes | note=pending edits committed and pushed`
- `fixer: rule-2 | branch=feature/fixer-skill-scaffold | commit=ef45678 | pushed=yes | note=moved off develop onto feature branch`
- `fixer: rule-3 | branch=develop | commit=none | pushed=yes | note=rebased over 2 upstream commits, pushed`
- `fixer: skipped | branch=develop | commit=none | pushed=no | note=merge in progress; needs human`

On any "stop and report" path, exit with a non-zero-equivalent summary
(`fixer: skipped | ... | note=<reason>`) so the caller's orchestration
can treat it as a precondition failure rather than success.

## How callers invoke the fixer

Run the fixer in a **subagent** (so its git noise stays out of the
caller's context) via the `Agent` tool, passing a self-contained prompt
like:

```
Use the /fixer skill to bring this working tree to a clean, pushed state.
Do NOT ask the user anything — apply the rules autonomously or stop and
report. Do NOT revert or discard any code.
Reason: <why the caller needs this>. Current branch: <branch>. Base
branch: <base>. Report the fixer output line and stop.
```

The caller then reads the single-line summary, updates its own state, and
retries its preconditions. If the summary starts with `fixer: skipped`,
the caller must NOT retry automatically — it surfaces the note to the
user and stops.
