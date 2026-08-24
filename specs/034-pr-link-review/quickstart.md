# Quickstart — 034-pr-link-review

How a developer exercises this feature end-to-end. Points at the
approved spec, plan, and contracts; tells you what to configure and run.

## Prerequisites

- Node.js LTS (18+), npm.
- Checked out on branch `034-pr-link-review` (or any feature branch
  after merge).
- Azure DevOps PAT with *Code (Read & Write)* and *Work Items (Read &
  Write)* scopes — reviewer and work-item-link writes need both.
- Credentials exported (or written to `.env`):

  ```env
  AZDO_PAT=<your-pat>
  AZDO_ORG=<your-org>
  AZDO_PROJECT=<your-project>
  AZDO_REPO=<your-repo>
  AZDO_PR_ID=<a PR you can safely mutate>
  AZDO_WORK_ITEM_ID=<a work item id in the same project>
  AZDO_REVIEWER=<an email or unique name that exists in the org>
  ```

## Build + test locally

```bash
npm ci
npm run lint
npm run typecheck
npm test                    # unit tests; skips integration suite without AZDO_* vars
npm test -- integration     # full suite when credentials are present
npm run build                # tsup bundle — zero warnings (constitution IV)
```

## Try the commands

```bash
# Link / unlink a work item
azdo pr work-items link 1234 --pr-number 64
azdo pr work-items link 1234 --pr-number 64        # no-op, exit 0
azdo pr work-items unlink 1234 --pr-number 64

# Add / remove reviewers
azdo pr reviewers add jane@example.com --pr-number 64                # optional
azdo pr reviewers add jane@example.com --pr-number 64 --required     # promotes in place
azdo pr reviewers remove jane@example.com --pr-number 64

# machine-readable
azdo pr work-items link 1234 --pr-number 64 --json
azdo pr reviewers add jane@example.com --pr-number 64 --json

# Template-aware pr open (requires a template file committed to the
# repository's default branch first, e.g. docs/pull_request_template/branches/develop.md)
azdo pr open --title "My change"                     # description from template alone
azdo pr open --title "My change" --description "Context up front"   # description + template appended
```

## Manual verification checklist

1. Confirm the linked/unlinked work item shows (or stops showing) under
   the pull request's **Work items** panel in the Azure DevOps web UI.
2. Confirm an added required reviewer appears with the "Required"
   badge; confirm re-running `add --required` on an already-optional
   reviewer flips the badge without creating a duplicate row.
3. Confirm `pr open` without `--description` against a branch with a
   matching `pull_request_template/branches/<branch>.md` produces a PR
   whose description is exactly that file's content.
