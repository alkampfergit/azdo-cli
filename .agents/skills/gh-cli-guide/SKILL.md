---
name: gh-cli-guide
description: Reference guide for the `gh` GitHub CLI. Invoke when another skill (gstack-gh, gstack-full, gh-security-and-quality, etc.) needs canonical command patterns for issues, PRs, checks, workflow logs, reviewer comments, code scanning, labels, or the REST API. Also used when the user asks "how do I X with gh".
---

# gh CLI reference

This skill is a **reference** — it does not perform actions on its own. Other skills call into the command patterns below. When invoked directly by the user, print the relevant section and examples.

Keep this file as the single source of truth for `gh` syntax. Action-oriented skills should link to sections here rather than duplicating raw commands.

## Prerequisites

- `gh` installed (`gh --version`)
- Authenticated: `gh auth status` — if not, ask the user to run `! gh auth login` in the chat (interactive login).
- Repository context: either run inside a git repo with an `origin` remote, or pass `--repo OWNER/NAME` to every command.

## Authentication & context

```bash
gh auth status                      # check login + scopes
gh auth refresh -s repo,read:org    # grant extra scopes
gh repo view --json nameWithOwner   # confirm the current repo
gh repo view --json defaultBranchRef # discover the default branch
```

## Issues

### List / search
```bash
gh issue list --state open --limit 50
gh issue list --label "automation" --state open --json number,title,labels,assignees
gh issue list --search "label:automation no:assignee" --json number,title
gh search issues "repo:OWNER/NAME label:ready state:open" --json number,title,url
```

### View
```bash
gh issue view 123 --json number,title,body,labels,assignees,state,comments
gh issue view 123 --comments        # human-readable with comments
```

### Claim (assign + comment + label)
```bash
gh issue edit 123 --add-assignee @me --add-label "in-progress"
gh issue comment 123 --body "Picked up by Claude. Starting implementation."
```

### Close
```bash
gh issue close 123 --comment "Resolved by #456"
gh issue edit 123 --remove-label "in-progress" --add-label "done"
```

## Pull requests

### Resolve the active PR
Never guess the PR number.

```bash
gh pr status
gh pr view --json number,title,url,headRefName,baseRefName
gh pr view 456 --json number,title,headRefName,baseRefName,url,state,mergeable,statusCheckRollup
```

### Create
```bash
gh pr create --title "feat: X" --body-file PR_BODY.md --base develop
gh pr create --fill                 # use commit message
gh pr create --draft --title "..."  # open as draft
gh pr create --head "$CURRENT_BRANCH" --base "$BASE_BRANCH"
```

### List
```bash
gh pr list --state open --author @me
```

### Comment
```bash
gh pr comment "$PR" --body "message"
gh pr comment "$PR" --body "$(cat <<'EOF'
## Multi-line body
- bullet
EOF
)"
```

### Close
```bash
gh pr close "$PR" --comment "Reason or pointer to release/PR"
```

### Merge
```bash
gh pr merge 456 --squash --delete-branch
gh pr merge 456 --auto --squash     # enable auto-merge when checks pass
```

## Checks & workflow runs

### Wait for / inspect checks on a PR
```bash
gh pr checks                         # quick status of current PR
gh pr checks "$PR" --watch --fail-fast
gh pr checks "$PR" --json name,state,link,workflow,bucket
```

Use `--watch --fail-fast` before diagnosing so you do not read half-finished results.

### Runs & failing jobs
```bash
gh run list --branch <branch> --limit 5
gh run view "$RUN_ID" --json jobs,name,headSha,conclusion,url
gh run view "$RUN_ID" --job "$JOB_ID" --log-failed
gh run view "$RUN_ID" --job "$JOB_ID" --log
```

Extract `RUN_ID` / `JOB_ID` from the `link` field returned by `gh pr checks --json ...`. Prefer `--log-failed` first and fall back to the full log only if needed.

## Reviews & reviewer comments

A GitHub review has three surfaces. Inspect all three when triaging feedback.

### Pending reviewer requests
`gh pr view` alone can under-report pending reviewer requests (especially GitHub Apps like Copilot). Use the API directly:

```bash
gh api repos/<owner>/<repo>/pulls/<N>/requested_reviewers \
  --jq '.users[].login, .teams[].slug'
```

### Review bodies & line-level comments
```bash
# Review-level bodies (summary, state, submitted_at)
gh api repos/<owner>/<repo>/pulls/<N>/reviews \
  --jq '.[] | {id,user:.user.login,state,submitted_at,body}'

# Line-level review comments (the most actionable surface)
gh api repos/<owner>/<repo>/pulls/<N>/comments \
  --jq '.[] | {id,user:.user.login,path,line,body}'

# Top-level issue comments on the PR (reviewers sometimes use these)
gh api repos/<owner>/<repo>/issues/<N>/comments \
  --jq '.[] | {id,user:.user.login,created_at,body: (.body[:200])}'
```

### Poll for a pending review to land
Useful when a bot reviewer (Copilot, etc.) takes a few minutes.

```bash
for i in $(seq 1 20); do
  pending=$(gh api repos/<owner>/<repo>/pulls/<N>/requested_reviewers \
    --jq '[.users[]?.login] | join(",")' 2>/dev/null)
  reviews=$(gh api repos/<owner>/<repo>/pulls/<N>/reviews \
    --jq '[.[] | select(.user.login=="<reviewer>")] | length' 2>/dev/null)
  echo "poll $i pending=[$pending] reviews=$reviews"
  if [ -z "$pending" ] || [ "$reviews" != "0" ]; then break; fi
  sleep 30
done
```

## Code scanning & standalone security checks

Some failures (e.g., `CodeQL`) appear on a PR with no workflow run behind them. `gh run view` will not help — use check-runs and code-scanning APIs.

```bash
PR_SHA="$(gh pr view "$PR" --json headRefOid --jq .headRefOid)"
gh api "repos/<owner>/<repo>/commits/$PR_SHA/check-runs"
gh api "repos/<owner>/<repo>/code-scanning/alerts?pr=$PR"
gh api "repos/<owner>/<repo>/check-runs/$CHECK_RUN_ID/annotations"
```

Quote endpoints that contain `?` when running under `zsh`.

## Dependabot & security alerts

The Dependabot security tab (`/security/dependabot`) is backed by the
`/dependabot/alerts` REST endpoint. Use it instead of scraping the UI.

```bash
# List every open alert with the minimum fields needed for triage
gh api repos/<owner>/<repo>/dependabot/alerts --paginate \
  --jq '.[] | select(.state=="open") | {number, severity: .security_advisory.severity,
         package: .dependency.package.name, manifest: .dependency.manifest_path,
         scope: .dependency.scope, summary: .security_advisory.summary,
         url: .html_url}'

# Full advisory (CVSS, vulnerable range, first-patched version) for one alert
gh api repos/<owner>/<repo>/dependabot/alerts/<N>

# Dismiss an alert with a reason (see dismissed_reason values below)
gh api -X PATCH repos/<owner>/<repo>/dependabot/alerts/<N> \
  -f state=dismissed \
  -f dismissed_reason=tolerable_risk \
  -f dismissed_comment='Short justification the security tab will display.'

# PRs that Dependabot itself opened
gh pr list --state open --json number,title,author,statusCheckRollup \
  --jq '.[] | select(.author.login=="app/dependabot")'
```

`dependency.scope` distinguishes `runtime` from `development`. `dismissed_reason`
must be one of: `fix_started`, `inaccurate`, `no_bandwidth`, `not_used`,
`tolerable_risk`. For the full fix workflow (triage → bump / override /
dismiss → validate) see
[.claude/skills/gh-security-and-quality/SKILL.md](../gh-security-and-quality/SKILL.md).

## Labels

```bash
gh label list
gh label create "automation" --color FFD700 --description "Auto-implementable by Claude"
gh issue edit 123 --add-label "automation"
```

## Direct REST / GraphQL API

```bash
gh api repos/OWNER/NAME/issues?labels=automation&state=open
gh api graphql -f query='...'       # complex queries
gh api repos/OWNER/NAME/issues/123/timeline --paginate
```

## Useful JSON + jq patterns

`gh` emits JSON with `--json <fields>` and can format with `--jq '...'`:

```bash
gh issue list --label automation --state open \
  --json number,title,labels \
  --jq '.[] | select([.labels[].name] | index("in-progress") | not) | {number, title}'
```

This finds issues with a given label that are **not yet** marked in-progress — useful for pollers that want idempotency.

## Conventions used by label-driven automation (gstack-gh / gstack-full)

When an automation skill drives issues via labels, the following markers are the default convention. Caller skills should expose them as args so repos can override.

| Purpose            | Mechanism                                            |
| ------------------ | ---------------------------------------------------- |
| Queue flag         | A label chosen by the user (e.g. `ready-for-claude`) |
| Claimed            | Label `in-progress` + assignee `@me`                 |
| Completed          | PR merged, issue closed with PR reference            |
| Failed / skipped   | Label `needs-human` + comment with reason            |
