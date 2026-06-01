# Quickstart — verify the 019-fix-pr-command fix locally

Run this recipe on any Azure DevOps repo to confirm the reported bug (#40) is fixed end-to-end and the new help text + warnings appear as specified.

## Prereqs

- Local clone of `alkampfergit/azdo-cli` on the `019-fix-pr-command` branch.
- A second clone of an Azure DevOps repo whose `origin` you can mutate (use a throwaway directory).
- `azdo` CLI built from this branch: `npm install && npm run build` once; subsequent runs use `npm run dev -- pr status` (or your local link).
- A PAT or signed-in account valid for the Azure DevOps organisation (existing auth flow; not in scope here).

## Step 1 — reproduce the original bug (control)

In a separate scratch clone of an Azure DevOps repo:

```bash
git clone https://dev.azure.com/<org>/<project>/_git/<repo> scratch-clean
cd scratch-clean
git remote set-url origin https://prxm@dev.azure.com/<org>/<project>/_git/<repo>
# Before the fix this exits 1 with "Git remote 'origin' is not an Azure DevOps URL.".
# On 019-fix-pr-command it should succeed (or, if no PR matches the current branch, hit C-2 below).
azdo pr status
```

Expected outcome on the fixed branch: either:
- The command renders the same PR table it would for the same URL written without `prxm@`, OR
- The command exits 1 with the zero-match message **C-2** (still validates the parser fix).

## Step 2 — credential-bearing warning (FR-004a, contract C-4)

Still inside `scratch-clean`:

```bash
git remote set-url origin "https://prxm:fake-token@dev.azure.com/<org>/<project>/_git/<repo>"
azdo pr status 2>&1 1>/dev/null | tee stderr.log
# stderr.log should contain exactly ONE line equal to:
#   azdo: warning: origin includes embedded credentials; consider removing them with 'git remote set-url origin <clean-url>'
# Run azdo pr status again in the SAME shell — the warning still appears (new process), but
# it must not appear twice in a single process. Use the unit tests to confirm one-per-process.
grep -c "azdo: warning: origin includes embedded credentials" stderr.log
# Must print 1.
grep -c "fake-token" stderr.log
# Must print 0.
grep -c "prxm" stderr.log
# Must print 0 (the user component is part of userinfo and must also not leak).
```

## Step 3 — `.git` suffix tolerance (FR-002)

```bash
git remote set-url origin https://prxm@dev.azure.com/<org>/<project>/_git/<repo>.git
azdo pr status
# Must behave identically to step 1 (no parser error).
```

## Step 4 — `--pr-number` help-text contract (FR-005, contract C-1)

```bash
for sub in status comments comment-resolve comment-reopen; do
  echo "--- $sub ---"
  azdo pr "$sub" --help | grep -F 'pull request whose source branch equals refs/heads/<current branch>' \
    || { echo "MISSING in $sub"; exit 1; }
done
```

All four iterations must print the substring; absence on any one fails the contract.

## Step 5 — zero-match error (FR-006, contract C-2)

Check out a freshly created local branch that has no remote PR:

```bash
git checkout -b "fix-pr-quickstart-verify-$(date +%s)"
azdo pr status 2> err.log
echo "Exit: $?"
cat err.log
# err.log must match the C-2 format exactly. Exit code must be non-zero.
```

## Step 6 — multi-match error (FR-006, contract C-3)

Multi-match is hard to reproduce naturally (Azure DevOps usually enforces at most one active PR per source branch). Verify it via the unit test instead:

```bash
cd <path-to-azdo-cli>
npm run test:unit -- tests/unit/pr.test.ts
# Look for the "renders multi-match error with branch and PR numbers" test — must pass.
```

## Step 7 — regression: non-userinfo URL stays byte-identical (FR-007)

```bash
git remote set-url origin https://dev.azure.com/<org>/<project>/_git/<repo>
azdo pr status --json > before.json
# Compare to the captured output of the same command before the fix shipped (committed
# alongside the test fixtures). Files must match byte-for-byte modulo timestamps in
# Azure DevOps' response.
diff before.json tests/fixtures/pr-status.expected.json
```

## Done

If steps 1–7 succeed, the local build satisfies every functional requirement and every CLI-surface contract for issue #40. Hand off to CI for the formal proof (`npm test && npm run lint && npm run build`).
