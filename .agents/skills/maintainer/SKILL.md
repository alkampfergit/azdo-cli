---
name: maintainer
description: >
  Routine repository security-maintenance pass. Create a fresh branch, use the
  gh CLI to enumerate security problems (Dependabot, code scanning, secret
  scanning), fix the actionable ones, verify, open a pull request, then hand off
  to /github-pr-fixer. Use when the user says "run maintainer", "do a security
  maintenance pass", "fix the security problems and open a PR", or similar.
disable-model-invocation: false
metadata:
  author: claude
  version: 1.0.0
  category: workflow
---

# Maintainer

Run an end-to-end security-maintenance pass on this repository: branch → scan →
fix → PR → hand off to `/github-pr-fixer`.

## Goal

Take the repo from "there may be open security alerts" to "a verified PR is open
that closes them", with the minimum of fuss and no surprises for the user.

## Prerequisites

- `gh` is already authenticated (do **not** run `gh auth login` / `gh auth
  status` — assume auth is in place).
- The working tree is clean. If it is not, stop and surface the dirty state to
  the user (or suggest the `fixer` skill) before starting — never start a
  maintenance branch on top of unrelated uncommitted work.
- The default base branch for PRs in this repo is **`develop`**.

## Steps

### 1. Create a new branch

- Make sure you are starting from an up-to-date base: `git switch develop && git
  pull --ff-only`.
- Create a dedicated branch, e.g. `git switch -c feature/security-maintenance`
  (or a more specific name if the user named the work). Never do maintenance
  work directly on `develop` or `master`.

### 2. Check with gh for security problems

Quote the API paths so the shell does not glob `?`. Use the `{owner}/{repo}`
placeholders — `gh` expands them from the repo remote.

```bash
# Dependabot (dependency vulnerabilities)
gh api 'repos/{owner}/{repo}/dependabot/alerts?state=open&per_page=100' \
  --jq '.[] | "#\(.number) [\(.security_advisory.severity)] \(.dependency.package.name) (\(.dependency.scope)) range:\(.security_vulnerability.vulnerable_version_range) fixed:\(.security_vulnerability.first_patched_version.identifier // "none")"'

# Code scanning (CodeQL / static analysis) — may be empty/disabled
gh api 'repos/{owner}/{repo}/code-scanning/alerts?state=open&per_page=100' \
  --jq '.[] | "\(.rule.security_severity_level // .rule.severity)\t\(.rule.id)\t\(.most_recent_instance.location.path):\(.most_recent_instance.location.start_line)"'

# Secret scanning — may be empty/disabled
gh api 'repos/{owner}/{repo}/secret-scanning/alerts?state=open&per_page=100' \
  --jq '.[] | "\(.secret_type_display_name)\t\(.html_url)"'

# Which security features are actually enabled
gh api repos/{owner}/{repo} --jq '.security_and_analysis'
```

Summarise findings in a short table (number, severity, package/rule, fix). Note
whether a feature is disabled vs simply has zero alerts — that distinction
matters to the user.

### 3. Fix them

- **Dependency alerts**: prefer the lockfile-only fix first — `npm audit fix`
  (or `npm update <pkg>` for specific packages). For transitive deps that a
  parent pins below the patched version, add an `overrides` entry in
  `package.json` pointing at the patched version, then `npm install`.
- **Code scanning / secret scanning**: fix in source. Never commit a removed
  secret without also rotating it — flag any live secret to the user
  immediately and do not just delete-and-move-on.
- Re-run `npm audit` (or the relevant scan) and confirm **0 vulnerabilities**.
- **Verify nothing broke**: run the build and tests (this repo: `npm run build`
  and `npx vitest run tests/unit`). A version bump that breaks the toolchain is
  not a fix. Do not proceed to the PR until build + tests are green.
- Commit with a clear `fix(security): …` message that lists the resolved
  advisories. End the commit message with the repo's required trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

If there are **no actionable alerts**, stop here and tell the user — do not open
an empty PR.

### 4. Open a PR

- Push the branch: `git push -u origin <branch>`.
- Open the PR against `develop`:

```bash
gh pr create --base develop --head <branch> \
  --title "fix(security): …" \
  --body "…summary table + verification (audit/build/tests)…"
```

- The PR body must include: the alert table, what changed and why (e.g. why an
  `overrides` entry was needed), and the verification evidence (audit result,
  build status, test count). End the body with the repo's PR trailer:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Report the PR URL back to the user.

### 5. Hand off to github-pr-fixer

`github-pr-fixer` is **manual slash-only** — it must never be auto-invoked or
chained from another skill. So do not call it yourself. Instead, finish by
telling the user the PR is open and inviting them to run it:

> PR #N is open. Run `/github-pr-fixer` to drive checks to green and address
> reviewer comments.

Only the user typing `/github-pr-fixer` may start it.

## Output

A short report containing: the branch name, the security findings table, what
was fixed, verification results (audit + build + tests), the PR URL, and the
`/github-pr-fixer` hand-off prompt.
