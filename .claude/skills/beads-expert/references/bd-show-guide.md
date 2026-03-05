# Beads `bd show` Command Reference

## Basic Usage

```bash
bd show <issue-id>              # full view
bd show <id> --json             # machine-readable JSON
bd show <id> --markdown         # markdown export
bd show <id> --history          # full change history
bd show <id> --deps             # dependency tree
bd show <id1> <id2>             # compare multiple issues
```

## Sample output

```
ID: bd-a1b2c3
Title: Fix login rate limiting
Type: bug
Priority: 0 (critical)
Status: open
Assignee: alice
Labels: backend, security
Created: 2026-01-28T20:15:00Z

Description:
Current login endpoint allows unlimited attempts. Implement rate
limiting with Redis at 5/min per IP.

Acceptance criteria:
- 429 response on excess attempts
- Reset window of 1 minute

Blockers: none
Depends on: []
Blocks: bd-f14c (payment integration)
Discovered from: bd-5f8c (auth refactor)
```

## Finding issues

```bash
bd list                         # all issues
bd list --status open           # open only
bd list --priority 0            # critical only
bd list --label backend         # filter by label
bd list --search "login"        # keyword search
bd ready                        # no blockers, ready to start
```

## Batch export

```bash
# Export all open issues to markdown files
for id in $(bd list --status open --json | jq -r '.[].id'); do
  bd show $id --markdown > "issues/$id.md"
done
```
