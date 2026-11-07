---
name: azdo-cli-conductor
description: Ask the azdo-cli issue agent to implement, monitor, review, and preview-publish a feature or fix.
---

# Ask the azdo-cli agent for a feature or bug fix

Repo: `alkampfergit/azdo-cli` (use `gh`). Always confirm with the user before posting anything outward-facing that wasn't requested (e.g. deleting comments, merging).

## 1. Open the issue

1. Check labels: `gh label list -R alkampfergit/azdo-cli`. Use `automated` plus `enhancement` or `bug`.
2. Write the body to a scratchpad file, then `gh issue create -R alkampfergit/azdo-cli --label automated --label enhancement --title ... --body-file <file>`.
3. Body must be self-contained: problem and motivation (real use case), proposed CLI options, the underlying REST request if known, acceptance criteria, and what is explicitly out of scope (bulk modes etc. go to a follow-up issue).

## 2. Understand how the agent behaves

- Label `automated` makes the agent post a short status comment first (`automata do-work: working…`). That is NOT a reply.
- It later **edits that same comment** into the real reply (plan + questions, or the PR link). Watch for comment edits (`updatedAt`/body hash), not only new comment counts.
- It may also post on the PR the same way (working… then edited reply).

## 3. Monitor (background watcher)

- Use a background Bash loop polling every ~30s, up to hours, that exits when the issue/PR comments' body hash or count changes. Re-arm it after every wake-up.
- Match strictly on the issue/PR number (`#<n>`); a loose search can match an unrelated PR.
- Wait until the agent says it opened a PR; do not stop at the first status line.
- Avoid shell `case` loops: the rtk rewrite can break the syntax. Prefer `gh pr checks --watch` or simple `while` loops, or `rtk proxy`.
- On each wake: read the latest comment; if it is only "working…", re-arm and say so briefly.

## 4. Conduct the conversation

- Answer the agent's plan questions on the issue in one comment, numbered to match its questions. Decide scope: split extras into follow-up issues, ask for paging on large lists, limit docs to what's needed.
- Restate the delivery requirements in that comment: fix every SonarQube/SonarCloud issue, request up to three Copilot reviews and address them between rounds, post the PR link on the issue.
- Report back to the user what was agreed.

## 5. PR quality loop

1. When the PR appears: check CI (`gh pr checks`), SonarCloud (0 issues/hotspots), and description.
2. The agent's account may not be able to request Copilot; request it from the user's account: `gh api -X POST repos/alkampfergit/azdo-cli/pulls/<n>/requested_reviewers -f 'reviewers[]=copilot-pull-request-reviewer[bot]'` (or the web-equivalent that worked), then watch for the review.
3. Read the Copilot review **fully** (summary body and inline comments; a finding may appear only in the summary—don't truncate output). Post the findings on the PR asking the agent to fix, add tests, and keep Sonar at 0.
4. Wait for the agent's push/edited reply, request the next round. Max 3 rounds; no fourth.
5. After the last fix, wait for CI green on the final commit (`gh pr checks --watch`).

## 6. Publish and test the npm preview

The CI workflow supports a maintainer-triggered preview. Discover the repository's current default branch (currently `develop`) and confirm the workflow input with `gh workflow view ci.yml`; dispatch on that default branch with the PR number. For example: `gh workflow run ci.yml --ref develop -f pr=<n>`. Only do this after the PR's latest commit passed `pull_request` CI.

- The workflow validates that the PR is open and that its current head SHA has a successful `pull_request` CI run; it publishes the artifact from that run, not a fresh build of PR code in the trusted publish job.
- Publishes dist-tag `pr-<n>`, version like `<next-minor>-pr.<n>.<run>`; `latest` is untouched.
- Wait for the workflow run to finish successfully and verify the npm dist-tag. Then `npm i -g azdo-cli@pr-<n>`. If npm hasn't indexed the tag yet, install by exact version. This replaces the user's global `azdo`; tell them before installing.
- Test on a real target: dry run, a rejected/invalid input, argument validation, one real action and read-back. Post the results as a comment on the PR saying it looks good to merge (merging is the maintainer's job).

## 7. Wrap up

Summarize for the user: PR link, review rounds and outcomes, CI/Sonar state, test table, what is still pending (merge/release). Ask before any irreversible follow-up (deleting old comments, re-posting findings).
