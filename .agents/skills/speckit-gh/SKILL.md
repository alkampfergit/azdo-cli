---
name: speckit-gh
description: Drive a single GitHub issue through the full speckit pipeline (specify → clarify → plan → tasks → PR-report → draft PR → implement → test → ready → CI → review) using the `gh` CLI. Fully human-in-the-loop — every speckit phase posts its artefact on the issue and polls for owner approval. All user communication stays on the issue / PR threads, never the console. Use when the user says "implement issue #N with speckit", "work this GH issue end-to-end", "run speckit on issue X", or passes a GitHub issue link. For label-driven polling across many issues, use `speckit-full`.
disable-model-invocation: false
---

# speckit-gh — one issue, end-to-end

Drive one GitHub issue from claim through merge by sequencing the five
speckit phases, gating each on an explicit owner approval posted on the
issue / PR, and owning the PR through CI and reviewer follow-up.

## Overview

| Phase | Speckit command      | Channel | Approval gate? |
| ----- | -------------------- | ------- | -------------- |
| 1     | (fetch & understand) | issue   | no             |
| 2     | (claim)              | issue   | no             |
| 3     | `/speckit-specify`   | issue   | **yes**        |
| 4     | `/speckit-clarify`   | issue   | **yes** (per question) |
| 5     | `/speckit-plan`      | issue   | **yes**        |
| 6     | `/speckit-tasks`     | issue   | **yes**        |
| 7     | (init PR report)     | issue   | no             |
| 8     | (open draft PR)      | issue → PR | no         |
| 9     | `/speckit-implement` | PR      | only if skill hits a real decision |
| 10    | (test)               | PR      | no             |
| 11    | (finalise PR report, push, mark ready) | PR | no |
| 12    | (watch CI)           | PR      | no             |
| 13    | (poll reviewer comments until merged)  | PR | merge / close / stand-down |

Step-by-step procedure with the exact `gh` commands, commit messages, and
comment bodies is in **[references/flow.md](references/flow.md)**.

Polling, watermark, re-fetch-before-post, and owner-login filtering rules
are in **[references/communication-protocol.md](references/communication-protocol.md)**.

## Inputs

Issue reference (one of):
- `123` (current repo)
- `owner/repo#123`
- `https://github.com/owner/repo/issues/123`

Optional `key=value` args:
- `claim-label` (default `in-progress`)
- `done-label` (default `done`)
- `fail-label` (default `needs-human`)
- `base` (default: repo default branch — for gitflow repos this is `develop`, which is the integration branch; never target `main`/`master` from a feature PR)
- `dry-run=true` — stop after the draft PR opens; do not run `/speckit-implement`
- `poll-seconds` (default `60`) — interval between issue/PR re-fetches while waiting on an owner reply
- `approval-timeout-minutes` (default `60`) — cap on a single approval poll; on timeout, park the issue with `fail-label` and exit

Confirm resolved values by posting a `speckit:status` comment on the issue
(step 2), not in the console.

## Preconditions (fail fast)

1. `gh auth status` — if not authenticated, abort and tell the user to run `! gh auth login`.
2. Working tree clean (`git status --porcelain` empty).
3. Currently on the base branch. (`/speckit-specify` creates its own branch — starting elsewhere corrupts the tree.)
4. `.specify/` is initialised: `spec-template.md`, `plan-template.md`, `tasks-template.md`, `pr-report-template.md` present, and `create-new-feature.sh` executable.
5. Issue is open, unassigned (or assigned to `@me`), and does NOT already carry `claim-label`.
6. **No open PR already closes this issue.** An earlier speckit run (or a
   manual PR) may have produced a PR whose body contains `Closes #<N>`.
   Re-running would duplicate the branch, the spec bundle, and the PR.
   Check with:

   ```bash
   gh pr list --repo <owner/repo> --state open \
     --json number,closingIssuesReferences,url \
     --jq ".[] | select(.closingIssuesReferences[]?.number == <N>)"
   ```

   If any PR is returned, abort: post a `speckit:status` on the issue
   linking the existing PR, do NOT apply `claim-label`, and exit cleanly
   (do NOT apply `fail-label` — this is not a failure, just a no-op).

Precondition failures that are mechanical git state (pending changes,
unpushed commits, non-fast-forward push rejections) are NOT surfaced to
the user — they are delegated to the `fixer` skill in a subagent without
asking. See **Precondition repair — delegate to `fixer` (no user
prompt)** below. Non-git failures (`.specify/` missing, `gh` not
authenticated, issue not open, PR already exists) still abort with a
clear message. Do NOT bootstrap speckit from this skill.

## Precondition repair — delegate to `fixer` (no user prompt)

If preconditions 2 or 3 fail (working tree not clean, or not on the base
branch with clean state) — or any later step produces a "repo is not in
a clean state" signal — delegate repair to the `fixer` skill **in a
subagent, without asking the user first**. The fixer is autonomous,
never reverts code, and returns a single-line summary that this skill
then relays back to the main prompt.

**Default stance:** do not prompt the user for confirmation on mechanical
git anomalies. Invoke the fixer and continue based on its output.

**Invoke the fixer when:**
- `git status --porcelain` is non-empty on any branch.
- `git push` is rejected as non-fast-forward.
- A previous run left a local commit that was never pushed.

**Do NOT invoke the fixer (abort with `fail-label` and surface to user):**
- `.git/MERGE_HEAD`, `.git/rebase-merge`, or `.git/CHERRY_PICK_HEAD`
  exists (a human operation is in progress).
- `HEAD` is detached.
- Untracked files that look like secrets are present.
- The failure is not git state (missing `.specify/`, `gh` not
  authenticated, issue closed, PR already binds this issue).

**How to invoke — via the `Agent` tool, with an explicit "do not ask the
user, do not revert code" briefing:**

```
Agent(
  description: "Repair dirty working tree",
  subagent_type: "general-purpose",
  prompt: "Use the /fixer skill to bring this working tree to a clean,
  pushed state so speckit-gh can proceed on issue #<N>. Do NOT ask the
  user anything — apply the rules autonomously or stop and report. Do
  NOT revert or discard any code. Reason: <why>. Current branch:
  <branch>. Base branch: <base>. Report the single-line fixer output
  and stop."
)
```

Parse the returned summary:
- `fixer: rule-1|rule-2|rule-3 | ... | pushed=yes` — re-check
  preconditions once. If still failing, abort with `fail-label`.
- `fixer: skipped | ... | note=<reason>` — do NOT retry. Abort with
  `fail-label` and post the note as a `speckit:status` on the issue.

**Invoke the fixer at most once per run.** If the first repair didn't
clear preconditions, stop. Rule-2 leaves the caller on a new
`feature/<slug>` branch; check out the base branch again before
retrying.

## Critical rules — do not violate

### Owner-only directives

**Only the primary owner — the GitHub login returned by
`gh repo view <owner/repo> --json owner --jq .owner.login` — may answer
approval polls or issue state-changing directives.** Resolve the owner once
at step 2 and filter every `select(...)` on
`.author.login == "<owner>"`. Comments from anyone else (including bots)
are read as code context only, never as decisions. If owner login cannot
be resolved, abort with `fail-label`.

### Everything through GitHub, nothing through the console

- Never ask the user a question in the chat console — always post on the
  active channel.
- The active channel is the **issue** until the draft PR opens in step 8,
  then the **PR** for the remainder of the flow.
- Prefix every bot comment with a machine-readable marker so your own
  messages are identifiable when polling:

  ```
  <!-- speckit:<kind>:<uuid> -->
  ```

  `<kind>` ∈ {`status`, `question`, `answer-ack`, `spec`, `clarify`,
  `plan`, `tasks`, `handoff`, `handoff-to-pr`, `failure`}.

- When you post a question or approval request, end with:

  ```
  Reply in a comment on this issue to continue. (speckit-gh will poll every <poll-seconds>s)
  ```

  Replace "issue" with "PR" for PR-phase prompts.

Full polling and re-fetch discipline: see
[references/communication-protocol.md](references/communication-protocol.md).
Every rule in that file is load-bearing — violating the watermark rule
has silently dropped owner comments in production.

### No auto-anything on speckit phases

- **Never** auto-answer a `/speckit-clarify` question or a
  `NEEDS CLARIFICATION` item raised during `/speckit-plan`. Post each on
  the issue and poll for the owner's reply.
- **Never** proceed past an approval gate without an owner-authored
  approving reply. A user's console invocation of `/speckit-gh` is NOT
  pre-approval of the spec / plan / tasks you have not yet written.
- **Never** auto-merge or auto-close the PR. Merging and closure are
  owner decisions.
- **Never** tag or release on merge. Merging a feature PR into the base
  branch (e.g. `develop` in gitflow repos) is NOT a release event. Do not
  run `git tag`, `gh release create`, bump a version in any manifest as
  part of the merge, or invoke release tooling. Tagging and releases are
  owned by the separate gitflow `release/*` process, driven manually by
  the owner — out of scope for this skill.

### No mentioning @copilot or other third-party GitHub bots

speckit-gh operates under the authority of the repo owner, not the bot
account it posts from. It does NOT have the authority to `@copilot`,
`@dependabot`, or any other GitHub-integrated AI bot. An `@copilot`
mention in a comment enqueues work on Copilot under the repo owner's
quota/identity — that is outside this skill's mandate.

- **Never** write `@copilot` (or any other bot mention that triggers
  action) in an issue or PR comment, PR body, commit message, or review.
- If you believe Copilot input would help (e.g. reviewing code,
  suggesting a fix, answering a clarify question), post a
  `speckit:status` asking the owner to mention `@copilot` themselves,
  and poll for the result like any other owner-gated action.
- This rule also applies to every delegated skill
  (`speckit-specify` / `speckit-clarify` / `speckit-plan` /
  `speckit-tasks` / `speckit-implement`) — include it in the briefing.

### Channel transition is fixed

The draft PR opens **between step 7 (PR-report init) and step 9
(`/speckit-implement`)** — before any production code is written. From
that moment onward, all communication moves to the PR thread. The issue
thread receives only two more comments: the `speckit:handoff-to-pr`
pointer in step 8 and the final `speckit:handoff` / merge-status comment
at the end.

### Branch and PR binding

- Branch naming is owned by `/speckit-specify`; do NOT force `feature/<N>`.
- Every PR body MUST contain `Closes #<N>`. That is the only binding
  between the issue and the branch.

### Check out the PR branch before editing code

Whenever work moves to a PR — whether this run opened it in step 8, or
the skill is resuming against a PR that already exists (picked up in
steps 12–13, or a `github-pr-fixer`-style follow-up) — the local working
copy MUST be on the PR's head branch before ANY file edit, commit, or
push.

Concretely, before the first edit on a PR:

```bash
gh pr checkout <pr-number>   # fetches and switches to the PR head branch
git status --porcelain       # must be empty
git rev-parse --abbrev-ref HEAD  # must equal the PR's headRefName
```

If the working tree is dirty, stop and surface it — do NOT stash or
discard changes blindly; they may be unrelated in-flight work.

Never:
- Edit files while still on the base branch (`develop` / `main`) and
  then try to push to the PR branch.
- Commit on a detached HEAD or on a branch whose name does not match the
  PR's `headRefName`.
- Assume you are on the right branch because `/speckit-specify` checked
  it out earlier in this session — sessions restart, cron fires in a
  fresh working directory, and `develop` is the startup branch.

This rule applies to every skill that edits code in a PR phase
(`speckit-implement`, CI-fix loops in step 12, reviewer-comment handling
in step 13). Include it in the delegation briefing.

## Inherited protocol for delegated skills

Every skill this one invokes (`speckit-specify`, `speckit-clarify`,
`speckit-plan`, `speckit-tasks`, `speckit-implement`) inherits the
communication protocol: no console Q&A, all comments on the active
channel, owner-login filter mandatory. Brief each delegation explicitly:
"all user communication goes on `<channel>` via `gh <issue|pr> comment`;
never use the console."

## Failure handling

If a step fails and cannot be recovered automatically:

1. Remove `claim-label`, add `fail-label`.
2. Post a `speckit:failure` comment on the active channel (issue for
   steps 1–7, PR for steps 8–13). If on the PR, also cross-link from the
   issue with a one-line pointer.
3. Leave the feature branch and draft PR (if any) intact.
4. Exit. Do not pretend success.

## Post-ready lifecycle

After the PR is marked ready in step 11, `speckit-gh` keeps ownership:

- Blocks on `gh pr checks <pr> --watch --fail-fast` until CI is terminal;
  fixes any failure on the feature branch, pushes, re-enters `--watch`.
- Polls PR reviewer comments every 5 min (delegate each cycle to a
  laconic subagent that ignores its own comments); applies owner-requested
  changes, re-runs CI, comments back with the commit hash.
- Exits on `MERGED` / `CLOSED` / owner-directed stand-down.

`github-pr-fixer` is NOT auto-invoked from here.

## What this skill does NOT do

- Ask anything through the chat console.
- Auto-answer clarify or plan questions.
- Skip any approval gate between speckit phases.
- Auto-merge or auto-close PRs.
- Tag, release, or bump a version on merge — gitflow release is separate.
- Mention `@copilot` or any other action-triggering bot — ask the owner to do it.
- Edit files on a PR without first `gh pr checkout <pr-number>`.
- Force branch naming or skip `Closes #<N>`.
- Touch `.env` or read secrets.
- Run integration tests against real external services unless the issue explicitly asked.

## References

- **[references/flow.md](references/flow.md)** — full per-step procedure with `gh` commands, commit messages, and comment bodies.
- **[references/communication-protocol.md](references/communication-protocol.md)** — polling loop, watermark rule, re-fetch-before-post, owner-login filter.
- `gh-cli-guide/SKILL.md` (sibling skill) — canonical `gh` command patterns.
