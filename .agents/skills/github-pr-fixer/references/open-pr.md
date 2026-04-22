# Open Pull Request

Use this path when the user wants a pull request opened from the current branch.

For raw `gh` / `git` syntax see `gh-cli-guide/SKILL.md` → **Authentication & context** and **Pull requests**. This file covers the decision logic.

## 1. Resolve the current branch

Use `git status --short --branch`, `git branch --show-current`, and
`git rev-parse --abbrev-ref --symbolic-full-name '@{u}'` to capture:

- current branch name
- whether the branch is clean or dirty
- whether an upstream branch already exists
- whether the current local HEAD has already been pushed

If the branch has uncommitted changes, make that explicit before opening the
PR. Do not silently include unexpected work.

## 2. Check whether a PR already exists

Use `gh pr view --json number,title,url,headRefName,baseRefName` (see gh-cli-guide → **Pull requests → Resolve the active PR**).

If a PR already exists for the current branch, stop and report it instead of
opening a duplicate.

## 3. Verify the base branch

Use repository context and git state to verify the intended base branch.
Prefer the tracked integration branch already used by the repository flow.
Do not guess.

Helpful commands: `git remote show origin` and `gh repo view --json defaultBranchRef` (see gh-cli-guide → **Authentication & context**).

If the correct base branch is still ambiguous, ask the user before creating the PR.

## 4. Check whether the current branch has been pushed

If the current branch has no upstream, it has not been pushed yet.

If the branch has an upstream, verify whether the current local HEAD is already
published or whether local commits still need to be pushed.

Useful commands:

```bash
git rev-parse --abbrev-ref --symbolic-full-name '@{u}'
git status --short --branch
git log --oneline '@{u}..HEAD'
```

Interpretation:

- no upstream: branch has not been pushed
- upstream exists and `@{u}..HEAD` is empty: current HEAD is already pushed
- upstream exists and `@{u}..HEAD` has commits: push is still required

## 5. Push the current branch if needed

If the current branch does not yet exist on the remote:

```bash
git push -u origin "$CURRENT_BRANCH"
```

Otherwise push only when local commits are not yet published:

```bash
git push
```

## 6. Open the PR from the current branch

Use `gh pr create --head "$CURRENT_BRANCH" --base "$BASE_BRANCH"` (see gh-cli-guide → **Pull requests → Create**). Add `--title` and `--body` when the user supplied them or repository workflow requires them.

## 7. Report the created PR

After creation, report:

- PR number
- PR URL
- head branch
- base branch

If checks should be watched immediately after creation, continue with
`references/pr-resolution.md` and `references/check-diagnosis.md`.
