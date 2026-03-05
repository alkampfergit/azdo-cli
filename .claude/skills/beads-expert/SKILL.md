---
name: beads-expert
description: >
  Use this skill whenever the user wants to create, import, organize, or refine a backlog in Beads
  (Steve Yegge's issue tracking tool). Trigger for ANY of these situations: writing new issues from
  scratch, importing backlog from a markdown file, converting requirements or specs into Beads issues,
  analyzing a codebase to generate or enrich a backlog, setting up issue dependencies (blocks/depends-on),
  defining priorities and labels, or generating a Claude Code prompt to automate backlog import.
  Also trigger when the user want to implement a backlog and whenever the user mention 'use beads'.
---

# Beads Backlog Skill

Beads is a lightweight, file-based issue tracker by Steve Yegge, designed to integrate with AI coding
agents like Claude Code. Issues are stored as structured files (`~/.beads/` by default), tracked with
short IDs like `bd-a1b2c3`, and manipulated via the `bd` CLI.

## When to use each workflow

| User wants to… | Go to |
|---|---|
| Write issues manually from a description | [Manual Issue Authoring](#manual-issue-authoring) |
| Import a markdown backlog file | [Markdown Import Workflow](#markdown-import-workflow) |
| Use code analysis to enrich issues | [Code-Aware Backlog Generation](#code-aware-backlog-generation) |
| Generate a Claude Code prompt for automation | [Claude Code Prompt Generator](#claude-code-prompt-generator) |
| Set up dependencies between issues | [Dependency Modeling](#dependency-modeling) |

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
Depends on:  [bd-xxxx, ...] — must be done first
Blocks:      [bd-xxxx, ...] — computed from reverse of depends-on
Discovered from: bd-xxxx  — optional causal link
```

### Key CLI commands

```bash
# Create an issue
bd create --title "..." --type feature --priority 2 --label "api,backend"

# Add description/notes interactively
bd edit bd-a1b2

# Set dependencies
bd link bd-child --depends-on bd-parent
bd link bd-child --blocks bd-other

# View
bd show bd-a1b2            # detailed view
bd list --status open      # list all open
bd ready                   # issues with no blockers

# Close
bd close bd-a1b2 --note "Done in PR #42"
```

---

## Manual Issue Authoring

When the user describes a feature, story, or bug, convert it into a well-formed Beads issue.

### Issue writing rules

1. **Title**: imperative verb, max ~60 chars. E.g., *"Add JWT refresh token rotation"*, not *"JWT issue"*.
2. **Type**: choose the most specific — `bug` for regressions, `spike` for research/unknowns, `chore` for non-functional work.
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

### Output format when Claude generates issues

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

Use this when the user has an existing markdown backlog file to import into Beads.

### Step 1 — Analyze the markdown

Read the file and identify:
- Items (headings, bullets, checkboxes) → map to issues
- Hierarchy (parent bullets = epics, children = tasks)
- Implicit dependencies (item B references item A by name)
- Existing metadata (priority markers like `P0`, `[bug]`, labels in brackets)

### Step 2 — Produce an issue plan

Before touching `bd`, output a structured plan:

```
IMPORT PLAN
===========
Total issues to create: N
Epics (no parent): X
Tasks (with parent dependency): Y

Issues:
  1. [feature] "Title of issue 1"  → no deps
  2. [feature] "Title of issue 2"  → depends on #1
  3. [bug]     "Title of issue 3"  → no deps
```

Ask the user to confirm or adjust before proceeding.

### Step 3 — Generate bd commands

```bash
# Example sequence
ID1=$(bd create --title "Setup authentication module" --type feature --priority 2 --label "auth,backend" --json | jq -r '.id')
ID2=$(bd create --title "Implement login endpoint" --type feature --priority 2 --label "auth,api" --json | jq -r '.id')
bd link $ID2 --depends-on $ID1

# Add descriptions via heredoc
bd note $ID1 << 'EOF'
## Context
Foundation module needed before any auth endpoints.

## Acceptance Criteria
- [ ] Module initializes with config
- [ ] JWT signing key loaded from env
EOF
```

### Step 4 — Verify import

```bash
bd list --status open
bd ready   # should show only root issues with no blockers
```

---

## Code-Aware Backlog Generation

Use when the user wants to analyze a codebase to discover missing work, TODOs, or refine existing backlog.

### Analysis checklist

When given access to a code folder, Claude should examine:

1. **TODO/FIXME/HACK comments** — each is a candidate `bug` or `chore` issue
2. **Test gaps** — untested public methods → `task` issues for test coverage
3. **Incomplete implementations** — `throw new NotImplementedException()`, empty stubs → `feature`
4. **Architecture mismatches** — backlog items that touch code that doesn't exist yet → add prerequisite issues
5. **Dependency order** — if issue B touches a class that issue A creates, B depends on A

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
[Setup infra] ← [Create DB schema] ← [Implement service] ← [Add API endpoint] ← [Write tests]
```

**Parallel work after shared foundation**:
```
[Create User model] ← [Implement login]
                   ← [Implement registration]
                   ← [Implement profile]
```

**Bug discovered during feature**:
```
[Implement file upload] → discovered → [Fix MIME type validation bug]
```

### Dependency validation

After modeling, run:
```bash
bd ready   # if this is empty and there are open issues → circular deps or all blocked
bd list --status blocked   # review blocked issues
```

---

## Claude Code Prompt Generator

When the user needs a ready-to-use prompt for Claude Code to automate backlog import, generate the following prompt template. Fill in placeholders based on what the user told you.

```
You are a backlog import agent. Your job is to read a markdown backlog file and the project source code, then create a complete, dependency-linked backlog in Beads.

## Inputs
- Backlog file: <PATH_TO_MARKDOWN>
- Source folder: <PATH_TO_SOURCE>
- Beads installed and initialized (bd init already run)

## Your workflow

### Phase 1: Analysis
1. Read the markdown file fully.
2. Scan the source folder: find TODOs, empty stubs, incomplete features, test gaps.
3. Build an internal map: each backlog item + relevant source files + discovered issues.

### Phase 2: Plan
4. Produce a numbered list of all issues to create with: title, type, priority, labels, parent dependency index.
5. Show the plan. Wait for my approval before proceeding.

### Phase 3: Import
6. Create issues in dependency order (parents first) using:
   `bd create --title "..." --type <type> --priority <0-3> --label "<labels>" --json`
   Capture the returned ID for each issue.
7. Link dependencies:
   `bd link <child-id> --depends-on <parent-id>`
8. Add descriptions with full context using `bd note <id>`.
   Each description must include: Context, Acceptance Criteria, Relevant Files, Technical Notes.

### Phase 4: Verify
9. Run `bd list --status open` and confirm count matches plan.
10. Run `bd ready` and report which issues are immediately actionable.
11. Show a summary: total issues, dependency graph roots, first recommended issue to tackle.

## Issue writing rules
- Titles: imperative verb + noun, max 60 chars
- Types: feature | bug | task | spike | chore
- Labels: use consistent domain tags (backend, frontend, api, db, auth, infra, test, docs, perf)
- Priority 0 only for production-blocking bugs
- Every issue must have at least 2 acceptance criteria
- Surface all code TODOs and stubs as separate issues with `discovered-from` links

Begin with Phase 1. Do not create any issues until I approve the plan in Phase 2.
```

---

## Quick Reference

```bash
bd init                          # initialize beads in current repo
bd create --title "..." --type feature --priority 2 --label "x,y" --json
bd note <id>                     # open editor to add description
bd link <id> --depends-on <id>   # set dependency
bd show <id>                     # full details
bd list                          # all issues
bd ready                         # unblocked issues
bd close <id> --note "..."       # close with note
bd export --format markdown      # export all to markdown
```

For full `bd show` command options, see `references/bd-show-guide.md`.
