# speckit-gh — per-step flow

Full procedure for each of the 13 steps in `SKILL.md`. Every command
assumes the resolved run args (`<N>`, `<owner/repo>`, `<claim-label>`,
`<poll-seconds>`, etc.) from the skill's invocation.

Before posting any comment referenced here, apply the rules in
[communication-protocol.md](communication-protocol.md) — owner-login
filter, watermark, re-fetch-before-post.

## 1. Fetch & understand

```bash
gh issue view <N> --repo <owner/repo> \
  --json number,title,body,labels,assignees,state,comments
```

Extract for later:
- `feature_description` — title + body, concatenated. Passed to `/speckit-specify`.
- `acceptance_criteria` — bullets under an "Acceptance criteria" / "Definition of done" heading, quoted verbatim.

Post a `speckit:status` summary on the issue: criteria, affected areas,
linked issues/PRs.

## 2. Claim

```bash
gh issue edit <N> --add-assignee @me --add-label <claim-label>
OWNER=$(gh repo view <owner/repo> --json owner --jq .owner.login)
```

Do NOT create a branch manually — `/speckit-specify` creates and checks
out the feature branch itself.

Post a `speckit:status` pick-up comment:
- Resolved owner login
- Base branch
- Resolved args (`claim-label`, `done-label`, `fail-label`,
  `poll-seconds`, `approval-timeout-minutes`, `dry-run`)
- Next step: "Running `/speckit-specify`; the spec will be posted here
  for approval."

## 3. Specify — and wait for spec approval

Invoke `/speckit-specify` with `feature_description` as `$ARGUMENTS`.
The skill creates the branch, writes `.specify/specs/<branch>/spec.md`,
and runs its own quality checklist.

Commit and push the spec:

```bash
git add .specify/specs/<branch>/
git commit -m "docs(#<N>): draft spec for <short-name>"
git push -u origin <branch>
```

Post a `speckit:spec` comment on the issue with:
- Branch name + link to `spec.md` on that branch
  (`https://github.com/<owner>/<repo>/blob/<branch>/.specify/specs/<branch>/spec.md`)
- User stories / acceptance criteria quoted verbatim
- List of any `[NEEDS CLARIFICATION]` markers emitted (note: resolved via `/speckit-clarify` next)
- Specify-checklist result
- Standard "Reply in a comment …" line

POLL for owner approval. On a correction, edit `spec.md`, commit +
push (`docs(#<N>): revise spec per owner feedback`), re-post the
updated `speckit:spec`, poll again. Loop until approval.

## 4. Clarify — one owner-answered question at a time

Invoke `/speckit-clarify`. It emits up to 5 ambiguity questions.
**Do NOT auto-answer any.** For each, in order:

1. Post a `speckit:question` on the issue:
   - Question verbatim
   - Options (if any) labelled A/B/C/…
   - Short "why this matters" line if clarify provided one
   - Standard "Reply in a comment …" line
2. POLL for the owner's answer.
3. Apply the answer to the relevant spec section AND append to the
   `## Clarifications` section in clarify's format
   (`- Q: <question> → A: <answer> [owner: <login>, <YYYY-MM-DD>]`).
4. Post a `speckit:answer-ack` quoting the resolved decision.
5. Commit: `docs(#<N>): apply clarification <topic>`.

When every question is resolved, push and post one `speckit:status`
listing all Q/A pairs + the branch SHA. End with "ready to proceed to
`/speckit-plan`?" and POLL once for approval.

If `/speckit-clarify` reports "No critical ambiguities detected", skip
the per-question loop, post a `speckit:status` saying so, and POLL once
for approval.

## 5. Plan — and wait for plan approval

Invoke `/speckit-plan`. It produces `plan.md`, `research.md`, and the
Phase 1 artefacts (contracts, data model, quickstart).

**If it raises `NEEDS CLARIFICATION` items during Phase 0 research, do
NOT auto-resolve.** Post each as a `speckit:question`, poll, apply to
`research.md`, commit, continue.

Read `AGENTS.md` / `CLAUDE.md`. Flag binding constraints (tests required,
forbidden files, required doc updates, constitution gates) in the plan
comment.

```bash
git add .specify/specs/<branch>/
git commit -m "docs(#<N>): plan and research for <short-name>"
git push
```

Post a `speckit:plan` on the issue:
- Links to `plan.md`, `research.md`, and each Phase 1 artefact
- One-paragraph summary of the architectural approach
- Key libraries / dependencies added or changed
- `AGENTS.md` / constitution constraints the plan honours
- `Complexity Tracking` section from `plan.md` if present
- Standard "Reply in a comment …" line

POLL for approval. Corrections loop back (edit, commit, push, re-post).

## 6. Tasks — and wait for tasks approval

Invoke `/speckit-tasks`. It writes `tasks.md`.

```bash
git add .specify/specs/<branch>/tasks.md
git commit -m "docs(#<N>): task breakdown for <short-name>"
git push
```

Post a `speckit:tasks` on the issue:
- Link to `tasks.md`
- Task count grouped by phase (Setup / Tests / Core / Integration / Polish)
- TDD strategy summary (which tests first, against what contracts)
- Parallelisable `[P]` tasks and the reasoning
- Standard "Reply in a comment …" line

POLL for approval.

## 7. Prepare PR report

1. Read `.specify/templates/pr-report-template.md`.
2. Pre-fill placeholders known at this point:
   - `[FEATURE NAME]` → spec header
   - `[###-feature-name]` → `git rev-parse --abbrev-ref HEAD`
   - `[DATE]` → today, `YYYY-MM-DD`
   - `[Link to spec.md …]` → relative path from repo root
   - **Summary** → derived from the first user story + overall description (2–3 sentences, non-technical; this feeds the PR title)
3. Write to `.specify/specs/<branch>/pr-report.md`. Leave `What's New`,
   `Testing`, and optional sections as placeholders (finalised in step 11).
4. Commit + push:

   ```bash
   git add .specify/specs/<branch>/pr-report.md
   git commit -m "docs(#<N>): initialise PR report for <feature name>"
   git push
   ```

No approval gate — purely clerical.

## 8. Open the draft PR (channel transitions here)

Open the PR as a **draft** on the already-pushed feature branch.
This is the fixed transition from issue-thread to PR-thread communication.

```bash
gh pr create \
  --draft \
  --head <branch> \
  --base <base> \
  --title "<type>(#<N>): <feature name>" \
  --body-file <(cat <<'EOF'
## Summary
- Implementing #<N> per the approved spec, plan, and tasks.
- **Status:** draft — implementation in progress.
- **Channel:** this PR thread is now the communication channel.

Closes #<N>

## Approved artefacts
- Spec: <link to spec.md on the branch>
- Plan: <link to plan.md>
- Tasks: <link to tasks.md>
- PR report (draft): <link to pr-report.md>

## Test plan
- [ ] (filled in once /speckit-implement completes)
EOF
)
```

Title derivation: first sentence of the PR-report Summary, truncated to
70 chars, prefixed with `<type>(#<N>): ` — `<type>` from the issue's
labels / body (`feat`, `fix`, `refactor`, `docs`, `chore`). Do not guess.

If `dry-run=true`: stop here, report the draft PR URL, exit.

Immediately after creation:

1. Post a `speckit:handoff-to-pr` on the **issue** with the PR URL and:
   "Further updates will appear on the PR thread."
2. From now on use `gh pr comment <pr-number>`. Poll against
   `gh pr view --json comments,reviews` plus
   `gh api repos/<o>/<r>/pulls/<N>/comments` (see
   [communication-protocol.md](communication-protocol.md)).

## 9. Implement — stop and ask on any real decision

Invoke `/speckit-implement`. Brief it: "all communication on PR #<pr> via
`gh pr comment`; never the console. Commits use scope `#<N>`."

If the skill hits a decision it cannot make alone (ambiguous acceptance
criterion, forced trade-off not covered in steps 3–6, contract mismatch
that invalidates the plan), stop and post a PR comment. Do not guess.

If an implementation question invalidates a prior approval (plan
infeasible), post a `speckit:status` explaining, offer options
("revise plan" loops back to step 5 on the PR thread; "descope and
re-open with narrower scope"), POLL for the owner's choice.

Commit incrementally per task group with task IDs in the message:
`feat(#<N>): T023–T027 implement domain model`.

## 10. Test

Discover validation commands from `package.json` / `Makefile` / `*.sln` /
`CLAUDE.md` / `AGENTS.md`. Common patterns:

- Node/TS (this repo): `npm run lint && npm test && npm run build`
- Python: `pytest`, `ruff check`
- .NET: `dotnet test` per target framework

Fix failures on the feature branch before marking ready. Integration /
external-API tests only run if the issue explicitly asked.

Post a `speckit:status` on the PR listing commands and results.

## 11. Finalise PR report, push, mark ready

Complete the remaining PR-report sections:

| Section | How to fill |
| --- | --- |
| **What's New** | One bullet per meaningful concern (command, service, config key) — not per file. From completed tasks + plan architecture sections. |
| **New Libraries / Dependencies** | Only packages new to this branch. Versions from `package.json`. Remove section if none. |
| **Breaking Changes** | Only if existing public behaviour (CLI flags, config keys, API contracts) changed. Remove section if none. |
| **Testing** | Test types used (unit / integration / e2e / manual) and what each covers. From test tasks in `tasks.md`. |
| **Notes** | Known limitations, deferred scope, follow-up issues. Remove section if none. |

Replace ALL remaining `[…]` markers. Remove optional sections that do
not apply.

```bash
git add .specify/specs/<branch>/pr-report.md
git commit -m "docs(#<N>): finalise PR report for <feature name>"
git push
gh pr edit <pr-number> --body-file .specify/specs/<branch>/pr-report.md
# Ensure Closes #<N> is in the body — append if pr-report.md doesn't carry it.
gh pr ready <pr-number>
```

Adjust title only if the implementation changed the nature of the change
(e.g. `feat` → `fix`): `gh pr edit --title ...`.

Post a `speckit:handoff` on the **issue** noting the PR is out of draft
and ready for review. This is the final issue comment; subsequent work
happens on the PR.

## 12. Watch CI to terminal state

```bash
gh pr checks <pr-number> --watch --fail-fast
```

Blocks until every required check is terminal. Do NOT replace with a
polling loop.

- All pass → step 13.
- Any fail → diagnose which check(s) failed and follow the specific path:

  ### SonarCloud Code Analysis fails — auto-fix, no user prompt required

  When `gh pr checks` shows `SonarCloud Code Analysis` as `fail`, proceed
  immediately without waiting for the user:

  1. **Query both issues and security hotspots** for this PR:

     ```bash
     # Regular issues (bugs, vulnerabilities, code smells)
     curl -s "https://sonarcloud.io/api/issues/search?componentKeys=<projectKey>&pullRequest=<pr>&statuses=OPEN,CONFIRMED&ps=50"

     # Security hotspots (separate API — NOT returned by issues/search)
     curl -s "https://sonarcloud.io/api/hotspots/search?projectKey=<projectKey>&pullRequest=<pr>&ps=50"
     ```

     The project key for this repo is `alkampfergit_azdo-cli`.

  2. **Invoke the `sonarcloud-pr-fix` skill** — it applies code fixes, runs
     local verification, and pushes the branch.

  3. **Security hotspots specifically**: fix the underlying code concern —
     do NOT mark a hotspot as "reviewed/safe" unless the code genuinely
     contains no risk. Common hotspot patterns and their fixes:
     - `PATH` manipulation (`S4036`) → replace `execSync('cmd')` with
       `execFileSync(absoluteBinaryPath, args)` where the binary path is
       resolved to a fixed, well-known location at startup.
     - Unsafe `eval` / `Function` → remove or replace with a safe
       alternative.
     - Hard-coded credentials → move to environment variables.

  4. **Commit and push** on the feature branch (the `sonarcloud-pr-fix`
     skill does this).

  5. **Post a `speckit:status`** naming the SonarCloud issues found and the
     fix applied (file, rule, line, one-line description of the change).

  6. **Re-enter `--watch`**. Loop until `SonarCloud Code Analysis` passes.

  ### Any other CI failure

  `gh run view <run-id> --log-failed`, fix on the feature branch, commit,
  push, re-enter `--watch`. Loop until green. Post a `speckit:status` per
  iteration with the failure and the fix.

Before every post after a blocking call, re-read the PR thread and
process new owner comments first — see
[communication-protocol.md](communication-protocol.md).

## 13. Poll reviewer comments until merged or closed

Once CI is green, poll PR feedback at a 5-minute cadence, delegating each
cycle to a laconic subagent that returns `nothing to do` when idle. The
subagent ignores its own comments (watermark discipline).

For each owner comment asking for a change or raising a finding:

1. Apply on the feature branch, commit (`fix(#<N>): ...` /
   `refactor(#<N>): ...`), push.
2. Re-enter `gh pr checks --watch` to confirm CI stays green.
3. Post a `speckit:status` reply summarising the change + commit hash.

### Owner-directed merge (when the owner says "close the branch" / "land it" / "merge this")

"Close the branch in `<base>`" is gitflow for **merge the feature branch
into the integration branch** — NOT `gh pr close` (which would close the
PR without merging). Interpret these owner phrases as merge directives:

- "close the branch in develop" / "land it" / "merge this" / "ready to
  merge" / "ship it"

When the owner posts such a directive on the PR (owner-login filter
applies), execute the merge yourself — this is NOT "auto-merge" because
the owner explicitly directed it. Procedure:

1. **Determine strategy from the owner's phrasing.** When the phrasing
   is unambiguous, proceed **without** a confirmation poll — the owner
   already made the call:

   - **"close" / "close the branch" / "close on `<base>`" / "close this
     in `<base>`"** → **gitflow close style**: strategy = `merge`
     (no-fast-forward merge commit, matches `Merge pull request #N from
     …` history) plus `--delete-branch`. In gitflow this phrasing
     IS the strategy; do NOT ask, do NOT default to squash or rebase.
   - **"squash" / "squash-merge" / "squash this"** → `squash` +
     `--delete-branch`. No poll.
   - **"rebase on `<base>`" / "rebase and merge" / "linear merge"** →
     `rebase` + `--delete-branch`. No poll.
   - **Ambiguous phrasings** ("land it", "merge this", "ready to
     merge", "ship it") → post a `speckit:question` offering `merge`
     / `squash` / `rebase` (gitflow repos default to `merge`) plus
     `--delete-branch`, and POLL for reply.

   Once strategy is determined, post a single `speckit:status` naming
   the strategy you will use so the decision is visible in the PR
   thread before the merge happens.

2. **Rebase the feature branch onto the latest base** locally (so
   conflicts are solved with full context, not via GitHub's merge UI):

   ```bash
   gh pr checkout <pr>                    # if not already on the PR head
   git status --porcelain                 # must be empty
   git fetch origin
   git rebase origin/<base>
   ```

3. **Conflicts:**
   - If the rebase completes cleanly, continue.
   - If git reports conflicts, attempt to resolve using context from the
     spec, plan, and existing PR diff. For each resolved file:
     `git add <file>` then `git rebase --continue`.
   - If a conflict is non-trivial, ambiguous, or touches logic outside
     the scope of this PR, STOP: post a `speckit:question` on the PR
     describing each unresolved conflict (file, hunk, both sides), run
     `git rebase --abort` to restore the pre-rebase state, and POLL for
     owner guidance. Do NOT guess on semantic conflicts.

4. **Force-push the rebased branch:**

   ```bash
   git push --force-with-lease
   ```

   Use `--force-with-lease` (never plain `--force`) so a concurrent
   push by someone else is not silently overwritten.

5. **Re-watch CI on the rebased tip** — the force-push re-triggers
   checks; wait for green before merging:

   ```bash
   gh pr checks <pr> --watch --fail-fast
   ```

   If a check fails on the rebased tip, fix on the feature branch,
   push, re-watch. Do not merge red.

6. **Merge via `gh` with branch deletion:**

   ```bash
   gh pr merge <pr> --<strategy> --delete-branch
   ```

   `<strategy>` matches the owner's confirmation (`--rebase` /
   `--squash` / `--merge`). `--delete-branch` removes the remote
   feature branch.

7. **Return to base and pull the merged state:**

   ```bash
   git checkout <base>
   git pull --ff-only origin <base>
   ```

   `--ff-only` guards against an unexpected diverged base.

8. **Post a `speckit:status` on the issue** (the PR thread is now
   closed-merged, so the final comment goes back to the issue) with:
   - The merge commit SHA on `<base>`
   - Confirmation that the feature branch was deleted
   - Label changes: applied `done-label`, removed `claim-label`

9. **Labels:** `gh issue edit <N> --remove-label <claim-label>
   --add-label <done-label>`.

10. **Do NOT tag, release, or bump a version.** Feature merging into
    the integration branch is not a release event in gitflow; tagging
    is owned by the separate `release/*` flow driven manually by the
    owner. If the owner's directive includes "tag as X.Y.Z" or
    "release", refuse and explain — redirect them to the manual
    release flow.

### Exit conditions

- PR becomes `MERGED` (either by the procedure above or by the owner
  merging it manually in the UI) → `speckit:status` on the **issue**
  with the merge commit, apply `done-label`, remove `claim-label`,
  exit. **Do NOT create a git tag, do NOT cut a GitHub release, do
  NOT bump a version.** In gitflow repos the feature lands on `develop`
  (the integration branch); tagging and release branches are owned by
  the separate gitflow `release/*` flow driven manually by the owner.
- PR becomes `CLOSED` without merge → `speckit:status` on the issue
  noting the close, remove `claim-label`, apply `fail-label` if not
  owner-directed, exit.
- Owner stand-down ("stand down", "stop polling", owner-filtered) →
  acknowledge and exit without `done-label`.

**Do NOT merge without an explicit owner directive.** "Auto-merge"
means merging on a signal other than an owner-authored directive on
the active channel (e.g. CI going green, timeout, label change by a
non-owner, a reviewer approval from a non-owner). Those never merge.
**Do NOT tag or release on merge.**
