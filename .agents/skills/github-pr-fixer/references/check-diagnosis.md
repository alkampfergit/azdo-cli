# Check Diagnosis

For raw `gh` syntax (checks, runs, jobs, APIs) see `gh-cli-guide/SKILL.md` →
**Checks & workflow runs**, **Code scanning & standalone security checks**.
This file covers the diagnostic flow.

## Wait for the current check cycle

Use watch mode before starting a new diagnosis so you do not read half-finished
results. Run `gh pr checks "$PR_NUMBER" --watch --fail-fast` then fetch the
structured status via `gh pr checks "$PR_NUMBER" --json name,state,link,workflow,bucket`
and/or `gh pr view "$PR_NUMBER" --json statusCheckRollup`.

Treat these cases differently:

- `SonarCloud Code Analysis` failed or Sonar reports open issues for the PR
- GitHub Actions job failed and the link contains `/actions/runs/<run>/job/<job>`
- A standalone security check failed with no workflow name, such as `CodeQL`

## Sonar path

If Sonar is failing, or if the user explicitly wants Sonar issues fixed, load
the `sonar` skill and read only the PR fix workflow:

- `.claude/skills/sonar/SKILL.md`
- `.claude/skills/sonar/references/fix-workflow.md`

Preferred command:

```bash
SONARCLOUD_PROJECT_KEY=alkampfergit_lucifer \
./.claude/skills/sonar/scripts/fetch_pr_analysis.sh alkampfergit_lucifer "$PR_NUMBER"
```

Use the returned issue list as the fix target inventory. Sonar may be green
even when other GitHub checks still fail, so do not stop after a green Sonar
result.

## Failed GitHub Actions job path

For a failed check whose link contains a workflow run and job:

1. Extract the run ID and job ID from the link.
2. View the failing steps first (`gh run view ... --log-failed`).
3. Fall back to the full log only if needed.

See gh-cli-guide → **Checks & workflow runs → Runs & failing jobs** for the
exact command forms.

Name the failure mode before fixing it. Prefer a minimal root-cause fix over
re-running a job unchanged.

## Standalone security check path

For standalone checks such as `CodeQL`, load
`references/standalone-security-checks.md`.
