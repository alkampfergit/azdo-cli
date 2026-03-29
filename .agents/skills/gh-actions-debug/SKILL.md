---
name: gh-actions-debug
description: Diagnose and fix failing GitHub Actions workflows using the gh CLI. Use when CI is failing, tests pass locally but not in CI, or the user wants to inspect workflow run logs and secrets.
---

# GitHub Actions Debug

Use this skill to investigate and fix GitHub Actions CI failures using the `gh` CLI.

## Goal

Identify why a GitHub Actions workflow is failing, extract actionable diagnostics from run logs, and apply fixes — without needing to open a browser.

## Prerequisites

- `gh` CLI installed and authenticated (`gh auth status`).
- Inside a git repository linked to a GitHub remote.

## Workflow

### 1. List recent runs and identify failures

```bash
# List recent runs on the current branch
gh run list --branch "$(git rev-parse --abbrev-ref HEAD)" --limit 10

# Or list all recent runs
gh run list --limit 10
```

Look at the status and conclusion columns to find `failure` runs. Note the **run ID** (numeric column).

### 2. Inspect failed run logs

```bash
# Show only the failed step logs (most useful starting point)
gh run view <run-id> --log-failed

# Show full logs for all steps (when diagnostics are outside failed steps)
gh run view <run-id> --log

# Structured summary of job-level pass/fail
gh run view <run-id> --json conclusion,jobs --jq '{conclusion: .conclusion, jobs: [.jobs[] | {name: .name, conclusion: .conclusion}]}'
```

When logs are large, filter with `grep`:
```bash
gh run view <run-id> --log-failed 2>&1 | grep -E "FAIL|Error|error:|NOT_FOUND" | head -20
```

### 3. Diagnose common failure patterns

| Symptom | Likely cause | How to verify |
|---|---|---|
| All API tests fail with auth/not-found errors | Secrets misconfigured or empty | Add diagnostic logging for env var lengths |
| Tests pass locally, fail in CI | Env var differences (whitespace, missing values) | Compare lengths, trim values |
| HTML error pages instead of JSON API errors | Invalid org/project/URL in API calls | Log the full request URL |
| Some tests fail, others pass | Check if failing tests share a `beforeAll` that fails | Read the test structure |
| `--log-failed` shows no output | The step might have been skipped, not failed | Use `--log` instead |

### 4. Verify and fix secrets

```bash
# List configured secrets (names only, not values)
gh secret list

# Set a secret from stdin (correct way)
printf '%s' "the-value" | gh secret set SECRET_NAME

# Set a secret from a .env file (use the sync script)
zsh scripts/sync-env-to-gh-secrets.zsh KEY1 KEY2 KEY3
```

**Common pitfall:** `gh secret set NAME --body -` sets the value to literal `"-"`, not stdin. Omit `--body` to read from stdin via pipe.

### 5. Watch a run in real-time after pushing a fix

```bash
# Push the fix
git push

# Wait a few seconds for the run to appear
sleep 5

# Find the new run
gh run list --branch "$(git rev-parse --abbrev-ref HEAD)" --limit 2

# Watch it until completion
gh run watch <run-id> --exit-status
```

### 6. Add test reports for better visibility

This project uses `dorny/test-reporter@v1` with vitest JUnit output. Tests produce XML reports that render as GitHub check annotations with per-test pass/fail:

```yaml
- name: Tests
  run: npx vitest run tests/unit --reporter=default --reporter=junit --outputFile.junit=test-results/unit.xml

- name: Upload test report
  if: always()
  uses: dorny/test-reporter@v1
  with:
    name: Unit Tests
    path: test-results/unit.xml
    reporter: java-junit
```

Requires `permissions: checks: write` on the job.

## Key `gh run` commands reference

| Command | Purpose |
|---|---|
| `gh run list` | List recent workflow runs |
| `gh run view <id>` | Summary of a specific run |
| `gh run view <id> --log-failed` | Logs from failed steps only |
| `gh run view <id> --log` | Full logs from all steps |
| `gh run watch <id> --exit-status` | Live-follow a run, exit non-zero on failure |
| `gh run view <id> --json conclusion,jobs` | Structured JSON output for scripting |
| `gh run rerun <id>` | Re-run a failed workflow |
| `gh run rerun <id> --failed` | Re-run only the failed jobs |

## Tips

- GitHub Actions masks secret values in logs. If you see `***` in unexpected places, a secret's value is appearing as a substring. This can itself be diagnostic (e.g., secrets that are too short).
- When adding diagnostic logging, log **lengths** and **boundary characters** of secret-derived values — never the values themselves.
- Integration tests that depend on `beforeAll` creating resources will all skip/fail if the setup fails. Check the first error, not the count.
- Use `--json` + `--jq` for scripting; use `--log-failed` for human debugging.
