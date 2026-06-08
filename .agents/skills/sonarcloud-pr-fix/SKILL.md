---
name: sonarcloud-pr-fix
description: Use when the user wants to find SonarCloud issues for the current branch pull request, fix them in the local repo, verify with local checks, push the branch, and confirm whether SonarCloud has reanalyzed the PR.
---

# SonarCloud PR Fix

Use this skill for PR-scoped SonarCloud cleanup work in this repository.

## Goal

Find the SonarCloud issues attached to the current branch's pull request, apply the smallest safe fixes, verify locally, push the branch, and check whether SonarCloud has refreshed on the latest commit.

## Default assumptions

- Repo root is the current working directory.
- The branch usually has an open GitHub pull request.
- This repo uses Beads for task tracking.
- The usual SonarCloud project key here is `alkampfergit_azdo-cli`.

## Workflow

1. Recover repo and branch context.
   - Read `AGENTS.md` and `CLAUDE.md`.
   - Run `git status --short --branch`.
   - Run `git rev-parse --abbrev-ref HEAD`.
   - Run `bd prime`.

2. Create and claim a Beads issue before editing code.
   - Example:
     - `bd create --title "Fix SonarCloud pull request issues" --type bug --priority 1 --label "sonarcloud,quality" --description "..."`
     - `bd update <id> --claim`

3. Resolve the current branch to a GitHub pull request number.
   - Preferred:
     - `curl -fsSL "https://api.github.com/repos/<owner>/<repo>/pulls?state=open&head=<owner>:<branch>"`
   - Extract the PR number from the response.
   - If there is no open PR, stop and tell the user.

4. Query SonarCloud for PR issues AND security hotspots (two separate APIs).
   - Regular issues (bugs, vulnerabilities, code smells):
     - `curl -fsSL "https://sonarcloud.io/api/issues/search?componentKeys=<projectKey>&pullRequest=<prNumber>&ps=100"`
   - Security hotspots (NOT returned by issues/search — requires a separate call):
     - `curl -fsSL "https://sonarcloud.io/api/hotspots/search?projectKey=<projectKey>&pullRequest=<prNumber>&ps=100"`
   - Also check PR status when needed:
     - `curl -fsSL "https://sonarcloud.io/api/project_pull_requests/list?project=<projectKey>"`
   - Summarize findings by file, rule, and line before editing.
   - For hotspots, the fix strategy is to remove or isolate the risky pattern —
     do NOT mark as "reviewed/safe" unless the code genuinely has no risk:
     - `PATH` manipulation (`S4036`) → replace `execSync('binary ...')` with
       `execFileSync(absoluteResolvedPath, args)` where the binary is found at
       startup by probing well-known absolute paths.
     - Hard-coded credentials → move to environment variables.
     - Unsafe `eval` / dynamic code → replace with a safe alternative.

5. Inspect the affected code and nearby tests.
   - Read only the files touched by SonarCloud plus relevant tests.
   - Prefer targeted fixes over broad refactors.
   - Watch for CI-only failures such as `tsc --noEmit` issues that local `npm test` may miss.

6. Apply fixes.
   - Use `apply_patch` for edits.
   - Keep behavior stable unless the Sonar issue requires a behavior change.
   - Typical fixes:
     - extract helpers to reduce cognitive complexity
     - simplify negated conditions
     - replace `String#replace()` with `replaceAll()` when global replacement is intended
     - prefer `RegExp.exec()` when Sonar requests it

7. Verify locally.
   - Minimum when TypeScript code changes:
     - `npm run typecheck`
     - `npm test`
     - `npm run lint`
   - If a command fails, fix that before pushing.

8. Commit and push.
   - Use non-interactive git commands only.
   - Run:
     - `git add <files>`
     - `git commit -m "<message>"`
     - `git pull --rebase`
     - `bd dolt push`
     - `git push`
   - If `bd dolt push` fails because no Dolt remote is configured, do not invent one.
     - Report the exact failure.
     - Create a follow-up Beads issue for the missing Dolt remote if one does not already exist.
     - Still complete `git push`.

9. Recheck remote status.
   - Confirm branch state:
     - `git status --short --branch`
   - Check GitHub checks for the pushed commit:
     - `curl -fsSL "https://api.github.com/repos/<owner>/<repo>/commits/<sha>/check-runs" -H "Accept: application/vnd.github+json"`
   - Requery SonarCloud:
     - `curl -fsSL "https://sonarcloud.io/api/project_pull_requests/list?project=<projectKey>"`
     - `curl -fsSL "https://sonarcloud.io/api/issues/search?componentKeys=<projectKey>&pullRequest=<prNumber>&ps=100"`

10. Report final state precisely.
   - Include:
     - PR number
     - files changed
     - local verification results
     - pushed commit SHA
     - whether SonarCloud has reanalyzed the latest commit yet
     - any remaining blocker outside the code changes

## Notes

- SonarCloud can lag behind GitHub pushes. If SonarCloud still shows an older `analysisDate` or commit SHA, say so explicitly instead of claiming the issues remain.
- GitHub Actions may reveal stricter typecheck failures than `npm test` if `typecheck` is not part of the test script. Always run `npm run typecheck` for TypeScript changes.
- Do not close the loop with "ready to push". Push the branch unless the user explicitly tells you not to.
