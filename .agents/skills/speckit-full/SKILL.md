---
name: "speckit-full"
description: "Autonomous end-to-end speckit pipeline: specify → clarify (self-answered) → plan → tasks. No human input required."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "azdo-cli"
---

## User Input

```text
$ARGUMENTS
```

The text after the command invocation is the feature description. You **MUST** use it — do not ask the user to repeat it.

## Goal

Run the full speckit pipeline completely autonomously. At every step where the standard workflow would pause and ask the user a question, **answer it yourself** using:

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

## Completion Report

After all four phases complete, output a summary:

```
## speckit-full Complete

**Feature**: <branch name>
**Spec**: <path to spec.md>
**Plan**: <path to plan.md>
**Tasks**: <path to tasks.md>

**Autonomous decisions made**: <count>
<list each AUTO decision with its rationale>

**Next step**: Run `/speckit-implement` to begin implementation.
```

---

## Failure Handling

- If any phase fails with a hard error (missing script, invalid branch state), stop and report the error to the user with the exact command output. Do not silently skip phases.
- If the spec quality checklist fails after 3 iterations, document remaining issues and continue to Phase 2 rather than blocking.
- Never fabricate file paths or script outputs — always run scripts and use real output.
