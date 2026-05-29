---
description: "Task list for 020-auth-docs-sync"
---

# Tasks: Sync authentication docs

**Input**: Design documents from `/specs/020-auth-docs-sync/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/auth-command-surface.md, quickstart.md

**Tests**: Not applicable — this is a documentation-only change. "Validation" is the manual verification in `quickstart.md` (build the CLI, diff docs against `--help`, check links). No automated test tasks are generated.

**Organization**: Tasks grouped by user story. US1 (P1) fixes the reported failure (entry-point docs); US2 (P2) reconciles/verifies the rest of the auth doc set.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the ground-truth auth surface the docs must match.

- [X] T001 Build the current CLI and capture authoritative help: run `npm run build` then `node dist/index.js auth --help`, `node dist/index.js auth login --help`, `auth status --help`, `auth logout --help`, `clear-pat --help`; keep the output as the reference.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Confirm the command-surface contract is correct before editing any prose.

**⚠️ CRITICAL**: No doc edits begin until the contract is confirmed accurate.

- [X] T002 Verify `specs/020-auth-docs-sync/contracts/auth-command-surface.md` against the T001 output and `src/commands/auth.ts`; correct the contract if any command/flag/deprecation differs (this contract is the reference for all later tasks).

**Checkpoint**: Authoritative surface confirmed — doc edits can begin.

---

## Phase 3: User Story 1 - New user can discover and use the login command (Priority: P1) 🎯 MVP

**Goal**: A reader of the entry-point docs (`README.md`, `docs/commands.md`) can see `azdo auth login` (OAuth default) presented as a current, supported command — resolving the #41 confusion.

**Independent Test**: Read `README.md` and `docs/commands.md` as a new user; confirm `azdo auth login` and the OAuth default are present and accurate, with PAT as the alternative and a link to the full guide.

### Implementation for User Story 1

- [X] T003 [P] [US1] Update the authentication summary in `README.md` (~line 19 and the "Authentication & PAT storage" reference at ~line 59): present `azdo auth login` as the default (OAuth) sign-in, PAT as the supported alternative, keep/repair the link to `docs/authentication.md`. Match the contract; do not over-describe (summary, not full guide).
- [X] T004 [P] [US1] Update the auth rows in `docs/commands.md` (~lines 18–21): add an `azdo auth login` row (OAuth default; key options `--use-pat`, `--device-code`, `--org`); revise the `azdo auth`, `azdo auth status`, `azdo auth logout` descriptions to reflect OAuth + PAT (not PAT-only); keep `azdo clear-pat` marked **Deprecated** with `azdo auth logout` as the replacement. Flags/descriptions must match `contracts/auth-command-surface.md`.

**Checkpoint**: Entry-point docs no longer make `azdo auth login` look unsupported (SC-001). MVP complete.

---

## Phase 4: User Story 2 - All auth docs consistent with the implemented commands (Priority: P2)

**Goal**: Every authentication-related document matches the actual CLI and is mutually consistent — no stale/contradictory references, no broken links.

**Independent Test**: Cross-check every command/flag/flow in the auth docs against the contract; confirm zero references to removed/renamed commands and zero contradictions between docs.

### Implementation for User Story 2

- [X] T005 [P] [US2] Verify `docs/authentication.md` against `contracts/auth-command-surface.md`; it is expected to be accurate — edit only where a genuine drift from the CLI is found. Confirm the full `azdo auth login` usage (with OAuth flags) is shown (per the `optsWithGlobals()` gotcha in research.md).
- [X] T006 [P] [US2] Verify `docs/oauth-app-registration.md`: command names match the contract, the custom-Entra-app flow is described coherently, and all internal cross-links resolve.
- [X] T007 [US2] Repo-wide sweep for stale auth references: `grep -rniE 'azdo auth|clear-pat|AZDO_PAT|personal access token' README.md docs/`. For every hit in a doc, confirm it matches the contract and is consistent with the other docs; fix any stale/contradictory statement. (Code/comment hits are out of scope — docs only.)
- [X] T008 [US2] Verify all internal cross-links in the touched docs resolve to an existing file/anchor (`README.md`, `docs/commands.md`, `docs/authentication.md`, `docs/oauth-app-registration.md`, `docs/linux-credential-store.md`) — zero broken links (SC-004).

**Checkpoint**: All auth docs accurate and mutually consistent (SC-002, SC-003).

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and guardrails.

- [X] T009 Run the `quickstart.md` verification end-to-end (steps 1–6) and confirm each expectation holds.
- [X] T010 Confirm the change is documentation-only: `git diff --name-only develop...` shows only `README.md`, `docs/**`, and `specs/**` (SC-005); no source/CLI files changed.
- [X] T011 Confirm repo checks still pass: `npm run lint && npm test && npm run build` (must not regress).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1, T001)**: no dependencies — start immediately.
- **Foundational (Phase 2, T002)**: depends on T001 — BLOCKS all doc edits.
- **US1 (Phase 3)**: depends on T002. Delivers the MVP (fixes #41).
- **US2 (Phase 4)**: depends on T002. Independent of US1 (different files) but logically follows for full consistency.
- **Polish (Phase 5)**: depends on US1 + US2.

### User Story Dependencies

- **US1 (P1)**: after T002 — independently testable via the README/commands.md read.
- **US2 (P2)**: after T002 — independently testable via the cross-doc consistency check. No hard dependency on US1.

### Parallel Opportunities

- US1: T003 (`README.md`) and T004 (`docs/commands.md`) are different files → run in parallel.
- US2: T005 and T006 are different files → run in parallel; T007/T008 follow once edits settle.
- US1 and US2 touch disjoint files and can proceed in parallel after T002.

---

## Parallel Example: User Story 1

```text
# After T002, launch both entry-point edits together:
Task T003: Update authentication summary in README.md
Task T004: Update auth rows in docs/commands.md
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. T001 (Setup) → T002 (confirm contract).
2. T003 + T004 (US1) → entry-point docs fixed.
3. **STOP and VALIDATE**: read README + commands.md; `azdo auth login` is present and accurate → #41's core complaint resolved.

### Incremental Delivery

1. Setup + Foundational → ground truth confirmed.
2. US1 → entry-point docs (MVP, fixes #41).
3. US2 → full auth-doc consistency + link check.
4. Polish → quickstart verification, docs-only diff check, repo checks green.

---

## Notes

- [P] = different files, no dependency on an incomplete task.
- The command-surface contract (`contracts/auth-command-surface.md`) is the single reference for every doc edit — when in doubt, the built CLI's `--help` wins.
- Documentation-only: no source, no CLI flags, no behaviour changes (FR-008 / SC-005).
- Commit after each logical group (e.g. US1 edits, then US2).
- Per the constitution, `README.md` accuracy after the spec run is a hard requirement — T003 covers it.
