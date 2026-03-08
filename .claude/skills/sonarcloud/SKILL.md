---
name: sonarcloud
description: >
  Analyze and fix SonarCloud issues on pull requests. Use when the user mentions
  SonarCloud, quality gate, code smells, duplication, or wants to check PR quality
  status. Reads issues via GitHub API, creates fix plans, and applies fixes with
  awareness of parallel agent safety.
---

# SonarCloud Quality Skill

This skill handles reading, analyzing, and fixing SonarCloud issues reported on
pull requests. SonarCloud runs as a GitHub App and reports results as PR checks
and comments.

## Memory

This skill maintains persistent memory in `memory/` within this skill directory.
After each session, update memory files with:
- New issue patterns encountered and how they were resolved
- Project-specific SonarCloud rules that frequently trigger
- Files that are chronic hotspots for issues

Before starting work, always read memory files to leverage past experience.

## When to use this skill

| User says... | Action |
|---|---|
| "check sonarcloud" / "quality gate" | [Read PR Issues](#read-pr-issues) |
| "fix sonarcloud issues" / "fix code smells" | [Fix Issues Workflow](#fix-issues-workflow) |
| "sonarcloud is failing" / "quality gate failing" | [Diagnose Quality Gate](#diagnose-quality-gate) |
| "check duplication" / "fix duplication" | [Fix Duplication](#fix-duplication) |

---

## Read PR Issues

### Step 1 -- Find the PR

```bash
# List open PRs
gh pr list --state open

# Get PR checks status
gh pr checks <pr-number>
```

### Step 2 -- Read SonarCloud results

SonarCloud reports via GitHub checks. To get details:

```bash
# Get check runs for the PR's head commit
gh api repos/{owner}/{repo}/commits/{sha}/check-runs \
  --jq '.check_runs[] | select(.app.slug == "sonarcloud") | {name, conclusion, output: .output.summary}'

# Get PR comments from SonarCloud bot
gh api repos/{owner}/{repo}/issues/{pr-number}/comments \
  --jq '.[] | select(.user.login == "sonarcloud[bot]") | .body'
```

### Step 3 -- Parse the SonarCloud summary

The SonarCloud bot comment typically contains:
- **Quality Gate** status (Passed/Failed)
- **New issues** count with breakdown (bugs, vulnerabilities, code smells)
- **Coverage** on new code
- **Duplication** on new code

Extract and present a concise summary to the user.

---

## Fix Issues Workflow

### Step 1 -- Categorize issues

Group SonarCloud issues by type:
1. **Bugs** -- Fix first (highest impact)
2. **Vulnerabilities** -- Fix second
3. **Code smells** -- Fix third
4. **Duplication** -- Fix last (see [Fix Duplication](#fix-duplication))

### Step 2 -- Plan fixes with parallel safety

**CRITICAL**: Check memory for known conflict hotspots before assigning work.

When using parallel agents to fix issues:
- **Partition by file** -- each agent gets exclusive files, never overlapping
- **Never modify shared hub files** in parallel (e.g., `src/index.ts`, `package.json`)
- **Cross-cutting refactors** (extracting shared helpers, renaming across files) must be done sequentially, not in parallel

Safe parallel pattern:
```
Agent 1: fixes in src/commands/get-md-field.ts + tests/unit/get-md-field.test.ts
Agent 2: fixes in src/commands/set-md-field.ts + tests/unit/set-md-field.test.ts
Agent 3: fixes in src/services/html-detect.ts + tests/unit/html-detect.test.ts
```

Unsafe parallel pattern (AVOID):
```
Agent 1: extracts shared helper from get-item.ts, set-field.ts, assign.ts
Agent 2: fixes duplication in get-item.ts, set-state.ts
-- CONFLICT: both touch get-item.ts
```

### Step 3 -- Apply fixes

For each issue:
1. Read the affected file
2. Understand the SonarCloud rule being violated
3. Apply the minimal fix (don't over-refactor)
4. Run `npm test && npm run lint` to verify

### Step 4 -- Verify

```bash
# Run full check suite
npm test && npm run lint && npm run typecheck

# Commit and push
git add <specific-files>
git commit -m "Fix SonarCloud issues: <brief description>"
git push
```

After pushing, the SonarCloud check will re-run automatically on the PR.

### Step 5 -- Update memory

After fixing issues, update `memory/patterns.md` with:
- Which rules triggered and how they were fixed
- Any new hotspot files identified

---

## Diagnose Quality Gate

When the quality gate fails, check these common causes:

1. **Coverage on new code < threshold** -- Need more tests
2. **Duplication on new code > threshold** -- See [Fix Duplication](#fix-duplication)
3. **New bugs/vulnerabilities** -- Must be zero for gate to pass
4. **New code smells above threshold** -- Reduce count

```bash
# Quick check: is the quality gate the only failing check?
gh pr checks <pr-number>

# Get detailed quality gate status
gh api repos/{owner}/{repo}/issues/{pr-number}/comments \
  --jq '.[] | select(.user.login == "sonarcloud[bot]") | .body' | head -50
```

---

## Fix Duplication

Duplication is the most common quality gate failure in this project.

### Detection

SonarCloud flags duplicated blocks (usually 10+ lines of identical or near-identical code).

### Common duplication patterns in this project

1. **Command boilerplate** -- ID parsing, org/project validation, error handling
   repeated across command files
   - **Fix**: Extract to shared helpers (already done in `src/services/command-helpers.ts`)

2. **Test setup** -- Same mock setup repeated across test files
   - **Fix**: Extract to shared test utilities in `tests/unit/helpers/`

3. **API call patterns** -- Similar fetch/auth/error patterns
   - **Fix**: Use shared `fetchWithErrors` from `azdo-client.ts`

### Duplication fix strategy

1. Identify the duplicated blocks from SonarCloud report
2. Find all instances in the codebase using Grep
3. Extract shared code into a helper/utility
4. Replace all instances with calls to the shared code
5. Ensure tests still pass

**Important**: Duplication fixes are cross-cutting refactors. Do them
**sequentially**, not in parallel agents. See [parallel safety](#step-2----plan-fixes-with-parallel-safety).

---

## Common SonarCloud Rules for This Project

| Rule | What it means | Typical fix |
|---|---|---|
| S1192 | String literal duplication | Extract to constant |
| S3776 | Cognitive complexity too high | Extract helper functions |
| S1481 | Unused local variable | Remove it |
| S6551 | Avoid String() on object types | Use explicit toString() or template literal |
| typescript:S107 | Too many parameters | Use options object |
| Duplication | Code blocks repeated | Extract shared helper |

---

## Troubleshooting

**SonarCloud check not appearing on PR**
- SonarCloud GitHub App may need to be re-authorized
- Check if the PR targets a branch SonarCloud is configured to analyze

**Quality gate passes locally but fails on SonarCloud**
- SonarCloud analyzes the diff against the target branch, not the full codebase
- Coverage and duplication thresholds apply only to new/changed code

**SonarCloud reports issues in files you didn't change**
- This can happen with duplication -- if you copied code from an existing file,
  both the source and destination are flagged
- Fix: refactor the shared code into a common location
