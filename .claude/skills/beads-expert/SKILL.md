---
name: beads-expert
description: >
  Manage backlogs using Beads (bd), Steve Yegge's file-based issue tracker.
  Use when the user wants to create, import, organize, or refine issues,
  convert specs or markdown into Beads issues, set up dependencies, define
  priorities and labels, implement backlog items, or whenever the user
  mentions 'use beads'. Works by running bd CLI commands to create, link,
  and track issues with dependency graphs.
---

# Beads Backlog Skill

Beads is a lightweight, file-based issue tracker designed for AI coding agents.
Issues are stored as structured files (`.beads/`), tracked with short IDs like
`bd-a1b2c3`, and manipulated via the `bd` CLI.

## When to use each workflow

| User wants to... | Go to |
|---|---|
| Write issues from a description | [Manual Issue Authoring](#manual-issue-authoring) |
| Import a markdown backlog file | [Markdown Import Workflow](#markdown-import-workflow) |
| Analyze code to enrich issues | [Code-Aware Backlog Generation](#code-aware-backlog-generation) |
| Set up dependencies between issues | [Dependency Modeling](#dependency-modeling) |
| Implement work from the backlog | [Implementation Workflow](#implementation-workflow) |
| Generate a Claude Code import prompt | [references/prompt-generator.md](references/prompt-generator.md) |

---

## Core Beads Concepts

### Issue anatomy

```
ID:          bd-a1b2c3
Title:       Short imperative title (verb + noun)
Type:        feature | bug | task | spike | chore
Priority:    0 (critical) | 1 (high) | 2 (normal) | 3 (low)
Status:      open | in-progress | blocked | closed
Labels:      comma-separated tags (e.g., backend, api, auth)
Description: What and why. Include acceptance criteria.
Depends on:  [bd-xxxx, ...] -- must be done first
Blocks:      [bd-xxxx, ...] -- computed from reverse of depends-on
Discovered from: bd-xxxx  -- optional causal link
```

### Key CLI commands

```bash
bd create --title "..." --type feature --priority 2 --label "api,backend"
bd edit bd-a1b2                          # add description/notes interactively
bd link bd-child --depends-on bd-parent  # set dependency
bd link bd-child --blocks bd-other       # reverse dependency
bd show bd-a1b2                          # detailed view
bd list --status open                    # list open issues
bd ready                                 # issues with no blockers
bd update bd-a1b2 --status in_progress   # claim work
bd close bd-a1b2 --note "Done in PR #42" # close with note
bd sync                                  # sync with git
```

For full `bd show` options, see [references/bd-show-guide.md](references/bd-show-guide.md).

---

## Manual Issue Authoring

When the user describes a feature, story, or bug, convert it into a well-formed Beads issue.

### Issue writing rules

1. **Title**: imperative verb, max ~60 chars. E.g., *"Add JWT refresh token rotation"*, not *"JWT issue"*.
2. **Type**: choose the most specific -- `bug` for regressions, `spike` for research/unknowns, `chore` for non-functional work.
3. **Description**: use this template:

```
## Context
Why this issue exists. What problem it solves.

## Acceptance Criteria
- [ ] Specific, testable condition 1
- [ ] Specific, testable condition 2

## Technical Notes
Implementation hints, relevant files, constraints.
```

4. **Labels**: use consistent naming. Suggest: `backend`, `frontend`, `api`, `infra`, `db`, `auth`, `perf`, `test`, `docs`.
5. **Priority**: default to 2 (normal). Only use 0 for production-blocking issues.
6. **Dependencies**: always think about what must exist first before this issue can start.

### Output format

When writing issues for the user (not yet in Beads), present them as a structured list:

```
### [1] Add JWT refresh token rotation
Type: feature | Priority: 2 | Labels: backend, auth
Depends on: (none)

**Context**: Current tokens are long-lived with no rotation...
**Acceptance Criteria**:
- [ ] Refresh endpoint issues new token pair
- [ ] Old refresh token is invalidated after use
- [ ] Expired token returns 401 with clear error
```

Then offer to generate the `bd create` commands or a Claude Code prompt to import them.

---

## Markdown Import Workflow

Use when the user has an existing markdown backlog file to import into Beads.

### Step 1 -- Analyze the markdown

Read the file and identify:
- Items (headings, bullets, checkboxes) to map to issues
- Hierarchy (parent bullets = epics, children = tasks)
- Implicit dependencies (item B references item A by name)
- Existing metadata (priority markers like `P0`, `[bug]`, labels in brackets)

### Step 2 -- Produce an issue plan

Before touching `bd`, output a structured plan:

```
IMPORT PLAN
===========
Total issues to create: N
Epics (no parent): X
Tasks (with parent dependency): Y

Issues:
  1. [feature] "Title of issue 1"  -> no deps
  2. [feature] "Title of issue 2"  -> depends on #1
  3. [bug]     "Title of issue 3"  -> no deps
```

Ask the user to confirm or adjust before proceeding.

### Step 3 -- Generate bd commands

```bash
ID1=$(bd create --title "Setup authentication module" --type feature --priority 2 --label "auth,backend" --json | jq -r '.id')
ID2=$(bd create --title "Implement login endpoint" --type feature --priority 2 --label "auth,api" --json | jq -r '.id')
bd link $ID2 --depends-on $ID1

bd note $ID1 << 'EOF'
## Context
Foundation module needed before any auth endpoints.

## Acceptance Criteria
- [ ] Module initializes with config
- [ ] JWT signing key loaded from env
EOF
```

### Step 4 -- Verify import

```bash
bd list --status open
bd ready   # should show only root issues with no blockers
```

---

## Code-Aware Backlog Generation

Use when the user wants to analyze a codebase to discover missing work, TODOs, or refine existing backlog.

### Analysis checklist

When given access to a code folder, examine:

1. **TODO/FIXME/HACK comments** -- each is a candidate `bug` or `chore` issue
2. **Test gaps** -- untested public methods -> `task` issues for test coverage
3. **Incomplete implementations** -- `throw new NotImplementedException()`, empty stubs -> `feature`
4. **Architecture mismatches** -- backlog items that touch code that doesn't exist yet -> add prerequisite issues
5. **Dependency order** -- if issue B touches a class that issue A creates, B depends on A

### Enrichment pattern

For each existing backlog item, add to description:
```
## Relevant Files
- src/Auth/TokenService.cs (main implementation)
- tests/Auth/TokenServiceTests.cs (test location)

## Code Notes
Found 2 TODOs in TokenService.cs lines 47, 89 related to this issue.
```

---

## Dependency Modeling

Good dependency graphs prevent blocked sprints. Follow these rules:

### Dependency types in Beads

| Link type | Meaning | Command |
|---|---|---|
| `depends-on` | Cannot start until parent is done | `bd link child --depends-on parent` |
| `blocks` | Computed reverse of depends-on | automatic |
| `discovered-from` | Causal link, not ordering | `bd link new --discovered-from source` |

### Dependency patterns

**Feature chain** (most common):
```
[Setup infra] <- [Create DB schema] <- [Implement service] <- [Add API endpoint] <- [Write tests]
```

**Parallel work after shared foundation**:
```
[Create User model] <- [Implement login]
                    <- [Implement registration]
                    <- [Implement profile]
```

**Bug discovered during feature**:
```
[Implement file upload] -> discovered -> [Fix MIME type validation bug]
```

### Dependency validation

After modeling, run:
```bash
bd ready   # if empty and there are open issues -> circular deps or all blocked
bd list --status blocked   # review blocked issues
```

---

## Implementation Workflow

Use when the user wants to pick up and implement work from the backlog.

### Step 1 -- Find work

```bash
bd ready                    # show unblocked issues
bd list --priority 0        # check for critical items first
```

Pick the highest-priority unblocked issue. If multiple issues share the same
priority, prefer ones that unblock the most dependents.

### Step 2 -- Claim an issue

```bash
bd update <id> --status in_progress
```

### Step 3 -- Understand the issue

Run `bd show <id>` and extract:
- **Acceptance criteria** -- these are the definition of done
- **Technical notes** -- implementation hints, relevant files
- **Dependencies** -- verify all `depends-on` issues are actually closed

If the issue lacks acceptance criteria or is unclear, ask the user to clarify
before writing code.

### Step 4 -- Implement

1. **Read relevant code** -- start with files mentioned in the issue's technical
   notes. If none are listed, use the codebase structure to locate the right area.
2. **Make changes** -- implement each acceptance criterion. Keep changes focused
   on what the issue asks for.
3. **Write/update tests** -- every acceptance criterion should have a
   corresponding test. Run the project's test suite to verify.
4. **Run linting/checks** -- execute the project's lint and build commands
   (check CLAUDE.md for the right commands).

### Step 5 -- Verify acceptance criteria

Walk through each acceptance criterion from the issue:
- If all pass: proceed to close
- If any fail: fix before closing
- If a criterion is ambiguous or untestable: flag it to the user

### Step 6 -- Close and follow up

Create a git commit referencing the issue, then close it with a note:

```bash
bd close <id> --note "Implemented in commit <sha>"
bd sync   # sync state with git
```

After closing, check if this unblocks other issues:
```bash
bd ready   # new issues may now be unblockable
```

If newly unblocked issues exist, inform the user and offer to continue with
the next one.

---

## Troubleshooting

**Issue: `bd` command not found**
Cause: Beads CLI not installed
Solution: Install beads per project setup docs

**Issue: `bd ready` returns empty but open issues exist**
Cause: Circular dependencies or all issues are blocked
Solution: Run `bd list --status blocked` and review dependency chains

**Issue: `bd create` fails with JSON parse error**
Cause: Special characters in title or label
Solution: Escape quotes in title, use simple comma-separated labels

**Issue: `bd sync` conflicts**
Cause: Multiple users modified issues concurrently
Solution: Resolve JSONL conflicts manually, then re-run `bd sync`
