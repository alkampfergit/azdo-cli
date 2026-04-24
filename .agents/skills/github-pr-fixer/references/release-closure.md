# Release Closure

Use this path only when the user explicitly asks to close the pull request.

For raw `gh` / `git` syntax see `gh-cli-guide/SKILL.md` →
**Pull requests** (view, checks, close, comment). This file covers the
decision flow.

## 1. Determine the release tag proposal

Start from `master` and inspect the latest tag:

```bash
git fetch origin --tags
git checkout master
git pull --ff-only origin master
git tag --sort=-v:refname | head -20
gh pr view "$PR_NUMBER" --json headRefName,baseRefName,url,title
```

If the head branch matches `release/<semver>`, treat that version as the
proposed tag.

Before doing any release operation, ask the user to confirm the tag or propose
another one. Do not create or push a tag without explicit confirmation.

Report in the confirmation prompt:

- latest tag currently on `master`
- proposed next tag
- source branch name

## 2. Rebase the branch if needed

After the user confirms the tag, ensure the PR branch is current with `master`.

```bash
git checkout "$HEAD_BRANCH"
git fetch origin
git rebase origin/master
git push --force-with-lease
```

If the branch is already up to date, do not rebase just for the sake of it.

## 3. Ensure checks are green before release

Run `gh pr checks "$PR_NUMBER" --watch --fail-fast` (see gh-cli-guide →
**Checks & workflow runs**). Do not proceed if required checks are failing.

## 4. Fast-forward master, tag, push, close PR, and delete branches

Use fast-forward only. Do not create a merge commit.

```bash
git checkout master
git fetch origin
git pull --ff-only origin master
git merge --ff-only "$HEAD_BRANCH"
git tag "$CONFIRMED_TAG"
git push origin master
git push origin "$CONFIRMED_TAG"
gh pr close "$PR_NUMBER" --comment "Released as $CONFIRMED_TAG"
git branch -d "$HEAD_BRANCH"
git push origin --delete "$HEAD_BRANCH"
```

See gh-cli-guide → **Pull requests → Close** for the `gh pr close` form.

### `gh pr close` after fast-forward push is expected to no-op

After the `git push origin master` step, GitHub detects that the PR's
head commit is reachable from the base branch and auto-moves the PR
state from `OPEN` to `MERGED`. The subsequent `gh pr close` call
therefore prints *"Pull request … can't be closed because it was
already merged"* — this is **not an error**. The release commentary
that `--comment` would have attached is skipped; post it as a plain
`gh pr comment` afterwards instead:

```bash
gh pr comment "$PR_NUMBER" --body "Released as $CONFIRMED_TAG — <release-url>"
```

Verify the final state with:

```bash
gh pr view "$PR_NUMBER" --json state,mergedAt,mergeCommit
# state should be "MERGED" (NOT ".merged" — that JSON field does not exist)
```

## 4b. Re-sync local master after closure

Once the PR is merged / closed, return to `master` and pull before
doing anything else. This catches commits the merge flow may have
added (squash commits, bot commits, release-note PRs, etc.) and
guarantees the local tree is the canonical post-release state before
any further work begins.

```bash
git checkout master
git pull --ff-only origin master
```

Do this even if the current session pushed the merge itself — it is
defensive and cheap, and it has repeatedly caught cases where the
assumed-equivalent local state was behind remote.

## 4c. Post a release summary comment

After closing the PR, post a final summary comment listing all fix rounds that
were applied during the PR cycle. This gives reviewers a single place to see
everything the automation did. Use `gh pr comment` with a HEREDOC body (see
gh-cli-guide → **Pull requests → Comment**).

Template:

```
## Release summary

**Tag:** `$CONFIRMED_TAG`
**Fix rounds:** $TOTAL_ROUNDS

<list each fix round: round number, what check failed, what was changed, commit SHA>

**Final state:** all checks green
```

If no fix rounds were needed, the comment should say "No fix rounds needed —
all checks passed on first push."

Branch cleanup requirements:

- Delete the old local release branch after the PR is closed.
- Delete the old remote release branch after the PR is closed.
- If local branch deletion fails because the branch is not fully merged
  locally, stop and explain rather than forcing deletion.

## 5. Release guardrails

- Never infer final tag approval from branch naming alone.
- Never create a tag before the user confirms the version.
- Never merge to `master` with anything other than fast-forward for this flow.
- Never close the PR before `master` and the tag are pushed successfully.
- Never skip old branch cleanup after a successful release close.
- If `git merge --ff-only` fails, stop and explain why instead of forcing a
  merge.
