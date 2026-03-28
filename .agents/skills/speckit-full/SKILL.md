---
name: "speckit-full"
description: "Autonomous end-to-end speckit pipeline: specify → clarify (self-answered) → plan → tasks → implement → open PR. No human input required."
compatibility: "Requires spec-kit project structure with .specify/ directory and gh CLI"
metadata:
  author: "azdo-cli"
---

## User Input

```text
$ARGUMENTS
```

The text after the command invocation is the feature description. You **MUST** use it — do not ask the user to repeat it.

## Goal

Run the full speckit pipeline completely autonomously through to a merged-ready pull request. At every step where the standard workflow would pause and ask the user a question, **answer it yourself** using:

1. Existing code patterns in `src/`
2. Project conventions in `CLAUDE.md` and `.specify/memory/constitution.md`
3. Industry-standard defaults for a TypeScript CLI tool
4. Conservative scope (never add features not mentioned in the description)

Document every autonomous decision as an assumption in the spec's Assumptions section.

---

## Phase 1 — Specify

Execute the full `speckit-specify` workflow using `$ARGUMENTS` as the feature description.

**Autonomous clarification rule**: If the specify step generates any `[NEEDS CLARIFICATION]` markers or presents multiple-choice questions, do NOT wait for user input. Instead:

1. Evaluate each option against the project's existing patterns (TypeScript CLI, commander.js, Azure DevOps API).
2. Select the option that best fits the existing codebase conventions and minimizes scope.
3. Replace the marker with your chosen answer.
4. Record your decision in the spec's `## Assumptions` section as: `- [AUTO] <topic>: chose <answer> because <one-line rationale>`

Proceed when the spec file is written and the checklist passes.

---

## Phase 2 — Clarify (Autonomous)

Execute the `speckit-clarify` workflow, but **answer every question yourself without pausing**.

For each question the clarify step raises:

1. **Analyze all options** against:
   - Existing code in `src/` (read relevant files if needed)
   - `CLAUDE.md` tech stack and conventions
   - `.specify/memory/constitution.md` principles
   - Reasonable defaults for a TypeScript Node.js CLI tool targeting Azure DevOps
2. **Select the best option** — prefer consistency with existing code over novelty.
3. **Immediately record** the answer: append `- Q: <question> → A: <answer> [AUTO: <rationale>]` to the `## Clarifications` section in the spec.
4. **Apply the clarification** to the relevant spec section as the standard clarify workflow would.
5. **Do not present questions to the user** — treat every question as if the user replied "recommended" (accept your own recommendation).

If the clarify step reports "No critical ambiguities detected", proceed immediately.

Stop after all questions are processed (max 5 per clarify rules). Save the updated spec.

---

## Phase 3 — Plan

Execute the full `speckit-plan` workflow.

**Autonomous clarification rule**: If the plan step encounters any `NEEDS CLARIFICATION` items during Phase 0 research, resolve them autonomously using the same approach as Phase 2. Document each resolution in `research.md` under an `## Autonomous Decisions` section.

Proceed when `plan.md`, `research.md`, and all Phase 1 artifacts are written.

---

## Phase 4 — Tasks

Execute the full `speckit-tasks` workflow.

Generate `tasks.md` following the standard task generation rules. No user interaction required.

---

## Phase 5 — Prepare PR Report

Before implementation begins, initialise the PR report from the template so it can be incrementally updated during implementation.

### Steps

1. Read `.specify/templates/pr-report-template.md`.

2. Pre-fill every placeholder that is already known at this point:
   - `[FEATURE NAME]` → feature name from the spec header
   - `[###-feature-name]` → output of `git rev-parse --abbrev-ref HEAD`
   - `[DATE]` → today's date in `YYYY-MM-DD` format
   - `[Link to spec.md …]` → relative path from repo root to `spec.md`
   - **Summary** → derived from the spec's first user story and overall description (2–3 sentences, non-technical)
   - Leave `What's New`, `Testing`, and optional sections as placeholders — they are completed in Phase 7.

3. Write the partially-filled file to `FEATURE_DIR/pr-report.md`.

4. Commit it to the feature branch:

   ```sh
   git add FEATURE_DIR/pr-report.md
   git commit -m "docs: initialise PR report for [FEATURE NAME]"
   ```

---

## Phase 6 — Implement

Execute the full `speckit-implement` workflow.

- Follow TDD approach: write tests before implementation where tasks specify it.
- Complete every task in `tasks.md` and mark each as `[X]` when done.
- Run `npm test && npm run lint` (or project equivalent) after all tasks are complete. Fix any failures before proceeding.
- **Do NOT open the PR yet.**

---

## Phase 7 — Finalise PR Report

After implementation is confirmed green, complete the PR report.

### Filling guidelines

Load `FEATURE_DIR/pr-report.md` (already partially filled in Phase 5) and complete the remaining sections:

| Section | How to fill |
|---------|-------------|
| **What's New** | One bullet per meaningful concern (command, service, config key, etc.) — not per file. Derive from completed tasks in `tasks.md` and architecture sections of `plan.md`. |
| **New Libraries / Dependencies** | List only packages that did not exist before this branch. Pull versions from `package.json`. Remove the section if none were added. |
| **Breaking Changes** | Include only if existing public behaviour (CLI flags, config keys, API contracts) changed. Remove section if none. |
| **Testing** | List test types used (unit, integration, e2e, manual) and what each covers. Derive from test tasks in `tasks.md`. |
| **Notes** | Known limitations, deferred scope, or follow-up issues. Remove section if none. |

Replace ALL remaining `[…]` markers. Remove optional sections that do not apply.

Commit the finalised report:

```sh
git add FEATURE_DIR/pr-report.md
git commit -m "docs: finalise PR report for [FEATURE NAME]"
```

---

## Phase 8 — Open Pull Request

Use the completed `pr-report.md` as the PR body.

### Steps

1. Push the feature branch:

   ```sh
   git push -u origin HEAD
   ```

2. Derive the PR title from the Summary section: use the first sentence, truncated to 70 characters, prefixed with `feat(<branch-number>): `.

3. Open the PR:

   ```sh
   gh pr create \
     --title "<PR title>" \
     --body "$(cat FEATURE_DIR/pr-report.md)" \
     --base develop \
     --head <feature-branch>
   ```

4. Report the PR URL to the user.

---

## Completion Report

After all phases complete, output:

```
## speckit-full Complete

**Feature**: <branch name>
**Spec**: <path to spec.md>
**Plan**: <path to plan.md>
**Tasks**: <path to tasks.md>
**PR Report**: <path to pr-report.md>
**Pull Request**: <PR URL>

**Autonomous decisions made**: <count>
<list each AUTO decision with its rationale>
```

---

## Failure Handling

- If any phase fails with a hard error (missing script, invalid branch state), stop and report the error with the exact command output. Do not silently skip phases.
- If the spec quality checklist fails after 3 iterations, document remaining issues and continue to Phase 2 rather than blocking.
- If `gh` is not installed or not authenticated, print the contents of `pr-report.md` and instruct the user to open the PR manually.
- If the push fails, report the error and do NOT force-push.
- Never fabricate file paths or script outputs — always run scripts and use real output.
