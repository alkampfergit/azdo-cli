---
description: "Task list for 019-fix-pr-command"
---

# Tasks: Fix `azdo pr` errors on valid Azure DevOps remotes

**Input**: Design documents from `/specs/019-fix-pr-command/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli-surface.md, quickstart.md

**Tests**: REQUIRED. The spec mandates them (SC-003) and `contracts/cli-surface.md`
pins exact strings (C-1…C-7). Test tasks below are written **first** and must
**fail** before the matching implementation lands.

**Organization**: Grouped by user story (US1 = P1 URL recognition, US2 = P2
help/error UX). The two stories touch disjoint source files
(`git-remote.ts`/`remote-warning.ts` vs `pr.ts`/`pr-client.ts`) and are
independently testable.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 — maps to the spec's user stories
- Every task names an exact file path

## Path Conventions

Single TypeScript CLI package: source in `src/`, tests in `tests/unit/`,
validation gate `npm test && npm run lint` (vitest + eslint).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the working surface before any edit.

- [ ] T001 Audit dependencies and branch state: confirm `019-fix-pr-command` is checked out and clean, and that no new runtime dependency is required (plan §"Libraries / dependencies" — zero additions). Confirm `vitest` picks up new files under `tests/unit/` (no config change expected; record if it does).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Freeze current parser behaviour BEFORE editing the regex, so the
FR-007 byte-identical guarantee (C-7) has an immutable baseline.

**⚠️ CRITICAL**: T002 must complete before the parser is touched in Phase 3 (T006).

- [ ] T002 Create the frozen regression-snapshot fixture `tests/unit/fixtures/git-remote.cases.ts` capturing the **current** `parseAzdoRemote(url)` and `parseRepoName(url)` outputs for the 5 non-userinfo, non-`.git` URL forms in `contracts/cli-surface.md` C-5 (forms 1–5). Treat the captured values as a frozen snapshot per C-7.

**Checkpoint**: Baseline frozen — user-story implementation can begin.

---

## Phase 3: User Story 1 — Recognise Azure DevOps remotes with a userinfo prefix (Priority: P1) 🎯 MVP

**Goal**: `azdo pr <sub>` resolves org/project/repo from a remote of the form
`https://<user>[:<token>]@dev.azure.com/<org>/<project>/_git/<repo>` (and the
legacy `*.visualstudio.com` forms, with/without trailing `.git`), without
loosening the host allow-list, and emits a one-time stderr warning when the
remote carries an embedded credential — never echoing the userinfo.

**Independent Test**: In a tree whose `origin` is
`https://prxm@dev.azure.com/prxm/Jarvis/_git/jarvis-claude-plugin`, run
`azdo pr status`; it resolves context and behaves identically to the same URL
without the `prxm@` prefix (spec US1, scenarios 1–4). Verified by the new parser
test matrix.

### Tests for User Story 1 (write first, must FAIL before implementation) ⚠️

- [ ] T003 [P] [US1] Extend `tests/unit/git-remote.test.ts` with: the 16 positive cases from C-5 (4 HTTPS forms × with/without userinfo × with/without `.git`), the 5 negative cases from C-6 (N1–N5, incl. the `dev.azure.com.evil.example` host-suffix rejections and the `ftp://` scheme), and a regression block asserting `parseAzdoRemote`/`parseRepoName` still equal the frozen fixture from T002 (C-7).
- [ ] T004 [P] [US1] Create `tests/unit/remote-warning.test.ts` asserting the C-4 contract: parsing a credential-bearing URL twice in one process emits exactly one warning line on stderr; the emitted line for a `user:token@` URL contains neither the user nor the token segment; a non-userinfo URL emits zero warnings. Use `__resetForTests()` between cases.

### Implementation for User Story 1

- [ ] T005 [US1] Create `src/services/remote-warning.ts` per data-model S-1: module-scope `warned` boolean (initial `false`), `noticeCredentialBearingRemote(): void` (writes the exact C-4 string to `process.stderr` once, never throws, never templated against the URL), and a test-only `__resetForTests(): void` with an inline test-only comment. (makes T004 pass)
- [ ] T006 [US1] Extend the regex set in `src/services/git-remote.ts` to absorb an optional `(?:[^@/]+@)?` userinfo prefix and an optional `(?:\.git)?` tail for every HTTPS form, keeping the literal host allow-list unchanged with `\b`/anchor boundaries so `dev.azure.com.evil.example` is still rejected (FR-001/002/003). On a successful parse where userinfo was present, call `noticeCredentialBearingRemote()` (FR-004a) and ensure no error/log/verbose path ever interpolates the userinfo (FR-004). (makes T003 pass; preserves T002 baseline)

**Checkpoint**: `npm run test:unit` green for `git-remote` + `remote-warning`; US1 is independently shippable (the reported bug is fixed).

---

## Phase 4: User Story 2 — Document & harden active-PR auto-detection (Priority: P2)

**Goal**: Every `azdo pr <sub> --help` that accepts `--pr-number` explains, in
one plain-language sentence, how the active PR is chosen when `--pr-number` is
omitted; zero-match and multi-match auto-detection fail with the exact,
branch-naming messages in C-2/C-3 — non-interactive, non-zero exit, no
auto-pick.

**Independent Test**: `azdo pr status --help` (and `comments`,
`comment-resolve`, `comment-reopen`) shows the rule; on a branch with zero/many
matching open PRs, `azdo pr status` prints the C-2/C-3 line to stderr and exits
non-zero with empty stdout (spec US2, scenarios 1–3).

### Tests for User Story 2 (write first, must FAIL before implementation) ⚠️

- [ ] T007 [P] [US2] Create `tests/unit/pr.test.ts` covering: the C-1 help-text contract — rendering `--help` for `pr status`/`comments`/`comment-resolve`/`comment-reopen` each contains the substring `pull request whose source branch equals refs/heads/<current branch>`; the C-2 zero-match error (exact string, stderr, exit 1, empty stdout); the C-3 multi-match error (exact string with `#`-prefixed, comma-space-joined PR numbers in API order, stderr, exit 1, no interactive prompt even when `isTTY`).

### Implementation for User Story 2

- [ ] T008 [US2] In `src/commands/pr.ts`, define a single shared `--pr-number` help sentence constant (research §4) and apply it to the `--pr-number` option of `status`, `comments`, `comment-resolve`, and `comment-reopen` so the text cannot drift (FR-005, C-1). (makes the help-text portion of T007 pass)
- [ ] T009 [US2] In `src/commands/pr.ts`, implement the auto-detection result handling gated on the candidate count: zero matches → emit the exact C-2 line to stderr and exit non-zero; ≥2 matches → emit the exact C-3 line (branch + `#`-prefixed PR numbers in API order) to stderr and exit non-zero; single match → unchanged happy path. Ensure no `readline`/interactive prompt exists on this path under any `isTTY` (FR-006, C-2, C-3). (makes the error portion of T007 pass)
- [ ] T010 [US2] Verify `src/services/pr-client.ts::listPullRequests()` returns the full candidate set for the current branch (research §3). Only modify it if it currently collapses/enforces uniqueness; otherwise leave untouched and note "no change required" — the multi-match decision lives in `pr.ts` (T009), keeping the API client free of UX concerns.

**Checkpoint**: US1 AND US2 both green and independently testable.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T011 [P] Run the `specs/019-fix-pr-command/quickstart.md` verification recipe end-to-end (reproduce the bug on the userinfo remote, confirm the fix resolves context and prints the one-time warning once).
- [ ] T012 Update user-facing docs only if the help-text change is user-visible: refresh the relevant `pr` examples in `README.md` / `docs/commands.md` and the `AGENTS.md` "Active Technologies"/recent-changes note (no new tech). Skip individual files that need no change and say so.
- [ ] T013 Run the full validation gate `npm test && npm run lint` and confirm green (build + vitest unit/integration + eslint). Fix any regression before handing off.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2 / T002)**: depends on Setup; **blocks T006** (parser edit must not happen before the baseline is frozen).
- **US1 (Phase 3)**: depends on T002. Tests (T003, T004) before implementation (T005, T006).
- **US2 (Phase 4)**: depends only on Setup; independent of US1 (disjoint files). Test (T007) before implementation (T008, T009, T010).
- **Polish (Phase 5)**: depends on US1 + US2 being complete.

### Within-story ordering

- US1: T003, T004 (fail) → T005 (satisfies T004) → T006 (satisfies T003, preserves T002).
- US2: T007 (fail) → T008 (help text) + T009 (errors) → T010 (verify client).

### Parallel Opportunities

- T003 ∥ T004 (different test files).
- T007 can run in parallel with all of US1 (different files, different story).
- T008 and T009 edit the same file (`pr.ts`) → **not** parallel with each other.
- T011 is parallelisable with documentation (T012) once code is green.

---

## Parallel Example: User Story 1

```bash
# Write both US1 test files first, in parallel (they must fail):
Task: "T003 Extend tests/unit/git-remote.test.ts with C-5/C-6/C-7 matrix"
Task: "T004 Create tests/unit/remote-warning.test.ts for the C-4 contract"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. T001 (setup) → T002 (freeze baseline).
2. T003/T004 (failing tests) → T005 → T006.
3. **STOP and VALIDATE**: `npm run test:unit` green; the reported #40 bug is fixed. Shippable on its own.

### Incremental Delivery

1. Setup + Foundational → baseline frozen.
2. US1 → validate → the bug fix is demoable (MVP).
3. US2 → validate → help/error UX shipped.
4. Polish (quickstart + docs + full gate).

---

## Notes

- [P] = different files, no incomplete-task dependency.
- Every contract string (C-1…C-7) is asserted **verbatim** — do not paraphrase the error/warning/help text.
- Verify each test FAILS before writing its implementation.
- Commit after each task or logical group.
- Do not widen the host allow-list; the negative cases (N1–N5) are the guardrail.
