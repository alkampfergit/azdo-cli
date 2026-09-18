# Tasks: SonarCloud clean sweep

Dependency order. `[P]` = parallelisable with its siblings (disjoint files).

## Phase 1 — Infrastructure (21 findings, no shipped code)

- [~] **T001** [P] `.github/workflows/ci.yml` — add `--ignore-scripts` to the
  three `npm ci` steps (L27, L63, L107). *(S6505 ×3)*
  **Written but not pushed** — see *Blocked* below.
- [~] **T002** [P] `.github/workflows/ci.yml` — replace `npx vitest run ...`
  at L36 and L78 with `npm exec --no -- vitest run ...`. *(S6505 ×2, S8543 ×2)*
  **Written but not pushed** — see *Blocked* below.
- [x] **T003** [P] `.devcontainer/postcreate.sh` — add
  `--proto '=https' --tlsv1.2` to the five `curl` invocations whose output is
  piped into a shell or written to disk (L25, L39, L45, L77, L106). *(S6506 ×5)*
- [x] **T004** [P] `.devcontainer/postcreate.sh` — `--ignore-scripts` on
  `npm install -g @openai/codex` (L30); `--no-build` on
  `uv tool install specify-cli` (L53). *(S6505, S8541)*
  **Amended during implementation:** `--no-build` is incompatible with the
  `--from git+...` source (it has no wheel to install), so the install moves to
  the PyPI release of the same project. See research D-8 — this is a real dev
  environment change, flagged in the PR body.
- [x] **T005** [P] `scripts/compute-version.sh` — `[` → `[[` at L47, L49, L58,
  L62, L70. *(S7688 ×5)*
- [x] **T006** [P] `.specify/scripts/bash/update-agent-context.sh` — hoist
  `NEEDS CLARIFICATION` into a readonly constant used by all five sites;
  delete the unused `local file_ended=false`. *(S1192, S1481)*

## Phase 2 — Source one-liners (6 findings)

- [x] **T007** [P] `src/commands/list-fields.ts` — narrow `stringifyValue` so
  the `String(...)` call is not applied to `unknown`. *(S6551)*
- [x] **T008** [P] `src/commands/relations.ts` L70 — `id1 ?? 'unknown'`. *(S6606)*
- [x] **T009** [P] `src/types/relations.ts` L40 — `usage: string` with the two
  known values documented in a comment. *(S6571 ×2)*
- [x] **T010** [P] `src/services/auth.ts` L26 — `export { maskedDisplay,
  normalizePat } from './auth-masking.js';`, keeping the local import of
  `maskedDisplay` (still used at L49). *(S7763)*
- [x] **T011** [P] `src/commands/pr.ts` L1580 — `.find()` → `.some()`; the
  result is only tested for existence. *(S7754)*

## Phase 3 — Complexity refactors (3 findings, shipped behaviour)

Each is its own commit. FR-002 (byte-identical output) is the acceptance bar.

- [x] **T012** `src/services/auth.ts` — extract `patFromEnvFile`; `findDotEnvPat`
  keeps only the walk-up. *(S3776, 17 → <15)*
- [x] **T013** `src/commands/auth.ts` — split `handleLogout` into
  `logoutAllOrgs` / `logoutSingleOrg`. *(S3776, 18 → <15)*
- [x] **T014** `src/commands/pr.ts` — split the `pr comments` action per plan
  R-1 into `parseCommentsOptions` / `resolveCommentsPullRequest` /
  `selectCommentThreads` / `describeEmptyThreads`, plus `shapeCommentThreads`
  (research D-9 — four helpers left the action at exactly 15, which is not a
  margin). *(S3776, 46 → ~12)*

## Phase 4 — Tests (5 findings)

- [x] **T015** [P] `tests/unit/trace-writer.test.ts` L155 — assert that the bad
  path does not throw and that the warning reached stderr. *(S2699)*
- [x] **T016** [P] `tests/unit/auth.test.ts` L169 — `toHaveLength(15)`. *(S5906)*
- [x] **T017** [P] `tests/unit/git-remote.test.ts` — parameterise both
  near-identical families in the first `describe` (parse-success and
  parse-null) as `it.each` tables. *(S5976, plus research D-7)*
- [x] **T018** [P] `tests/integration/md-generic-types.test.ts` — parameterise
  the five single-assertion round-trip tests as one `it.each` table, keeping
  the 20 s per-case timeout. *(S5976)*
- [x] **T019** `tests/integration/auth.integration.test.ts` +
  `tests/integration/helpers/skip-unless-integration.ts` — declare the test
  with a literal `it(...)` and skip inside the body via the vitest context;
  the helper becomes a boolean predicate. *(S2187)*

## Phase 5 — Verification

- [x] **T020** `npm test && npm run lint` — green, with no test removed.
- [ ] **T021** Re-query the SonarCloud issues API for the branch; confirm the
  35 are gone and nothing new appeared.
- [ ] **T022** Push and confirm CI is green — in particular the keyring
  integration suite under `--ignore-scripts` (research D-1). If it is red,
  revert T001 and say so in the PR.
- [x] **T023** Record the change in `docs/` if any user-visible behaviour moved.
  Expected: none, so no `docs/` or `README.md` edit (AGENTS.md convention).

## Outcome

`npm test && npm run lint` green: 70 test files passed / 12 skipped, 1216
passed / 128 skipped, ESLint 0 errors (the 2 remaining warnings in
`audit-log.test.ts` predate this branch and are not in the 35). `npm run
typecheck` clean. No test was removed: the two parameterised tables carry the
same 15 and 5 cases as the `it(...)` blocks they replaced.

## Blocked

**T001 / T002 — 7 findings in `.github/workflows/ci.yml` — written, verified,
not pushed.** The agent's GitHub token carries `gist, read:org, repo` and not
`workflow`, so the push was rejected:

```
! [remote rejected] refusing to allow an OAuth App to create or update
  workflow `.github/workflows/ci.yml` without `workflow` scope
```

The change is not lost: it is committed as
`specs/041-sonarcloud-cleanup/ci-workflow.patch` and applies cleanly with

```bash
git apply specs/041-sonarcloud-cleanup/ci-workflow.patch
```

Until someone with `workflow` scope applies it, **7 of the 35 findings remain
open** and SC-001 (35 → 0) is only partially met — 28 → 0 on everything the
token could touch. This also means the `--ignore-scripts`-vs-keyring question
in research D-1 is still untested in CI; whoever applies the patch should watch
the `integration-tests` job and revert the three `npm ci` hunks if the
credential-store suite goes red.
