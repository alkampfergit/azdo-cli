# Implementation Plan: Fix `azdo pr` errors on valid Azure DevOps remotes

**Branch**: `019-fix-pr-command` | **Date**: 2026-05-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/019-fix-pr-command/spec.md`

## Summary

`azdo pr <sub>` aborts with *"Git remote 'origin' is not an Azure DevOps URL"* on any remote whose authority component contains a userinfo prefix (e.g. `https://prxm@dev.azure.com/...`). Cause: the URL regex in [`src/services/git-remote.ts`](../../src/services/git-remote.ts) anchors the host immediately after `https?://`, so any `user@` or `user:token@` before the host fails the pattern. Also incidentally: a trailing `.git` suffix is rejected.

Fix is surgical: extend the host-recognition layer to tolerate an optional userinfo prefix and an optional `.git` suffix while keeping the host set unchanged; never echo userinfo anywhere in stdout/stderr; emit a single one-time per-process stderr warning the first time a credential-bearing remote is parsed; document the existing branch→PR auto-detection rule in every `azdo pr <sub> --help`; harden the zero-match and multi-match error messages to name the searched branch and the detection rule. The change is bounded to the URL parser, the `pr` command tree, and the corresponding unit tests; no new runtime dependency.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: commander.js (existing), native `fetch` (existing), `node:child_process` `execSync` for `git remote get-url origin` and `git rev-parse --abbrev-ref HEAD` (existing). No new runtime deps.
**Storage**: N/A
**Testing**: vitest (per constitution); existing unit/integration split via `npm run test:unit` / `npm run test:integration`.
**Target Platform**: Node.js LTS (18+) on macOS / Linux / Windows.
**Project Type**: CLI (single TypeScript package, `src/`/`tests/` layout).
**Performance Goals**: N/A (latency is dominated by the Azure DevOps API call, not the parser).
**Constraints**: Zero new runtime dependencies. No `any`; `unknown` only with type guards (constitution II). Behaviour for non-userinfo URLs MUST stay byte-identical (FR-007).
**Scale/Scope**: ~2 source files touched (`src/services/git-remote.ts`, `src/commands/pr.ts`), 1 new helper for the one-time warning, 2 unit test files added/extended.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. CLI-First Design** | ✅ | Change is entirely within commander.js commands and their help text. Exit codes meaningful (zero on success, non-zero on multi-match per FR-006). No new `--json` surface; the existing `--json` flag on `pr status` remains untouched. |
| **II. TypeScript Strictness** | ✅ | All new code uses concrete types; the warning singleton is a typed module-scope `boolean`. No `any`. |
| **III. Single Responsibility Commands** | ✅ | No new command; the existing `pr <sub>` commands keep their existing scope. The parser fix lives in the shared service (`src/services/git-remote.ts`) — already the canonical location for remote-URL logic. |
| **IV. npm Distribution** | ✅ | No new dependencies; bundling is unaffected. |
| **V. Simplicity** | ✅ | Smallest change that satisfies every FR. Userinfo and `.git` are absorbed by tightening the existing regex array (rejected: rewriting the parser around the WHATWG URL class — would change parsing semantics for legacy `*.visualstudio.com` hosts that the regex set treats specially via `DefaultCollection`). One-time warning is a module-scope flag, not a process-wide event bus. |

**Re-check after Phase 1 design**: see "Post-design Constitution Re-check" at the bottom of this plan.

## Project Structure

### Documentation (this feature)

```text
specs/019-fix-pr-command/
├── plan.md                         # This file
├── research.md                     # Phase 0 — URL recognition + warning approach
├── data-model.md                   # Phase 1 — entities/contracts (kept minimal; see file)
├── contracts/
│   └── cli-surface.md              # CLI help text, error messages, warning string
├── quickstart.md                   # Phase 1 — local verification recipe
├── checklists/
│   └── requirements.md             # Spec-quality checklist (from /speckit-specify)
└── tasks.md                        # Phase 2 (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── commands/
│   └── pr.ts                       # MUTATED: --pr-number help text; multi-match error format
├── services/
│   ├── git-remote.ts               # MUTATED: regex updates; credential-warning emission point
│   ├── pr-client.ts                # MUTATED only if multi-match aggregation lives here today
│   └── (new) remote-warning.ts     # NEW (small): module-scope flag + emitter for the one-time warning
└── types/
    └── work-item.ts                # Unchanged (AzdoContext interface stays the same)

tests/
└── unit/
    ├── git-remote.test.ts          # EXTENDED or NEW: userinfo + .git matrix + warning-once invariant
    └── pr.test.ts                  # EXTENDED or NEW: --help text contract, multi-match error contract
```

**Structure Decision**: Stay with the existing flat `src/` layout (single CLI package, no monorepo). The new `remote-warning.ts` is preferred over inlining the singleton in `git-remote.ts` so the warning behaviour can be exercised independently in tests (state reset between tests via an exported `__resetForTests()` helper guarded by a comment).

## Phases

### Phase 0 — Research

See [research.md](./research.md) for the full decision log. Summary:

1. **URL recognition extension** — Decision: extend the existing regex set in `git-remote.ts` to optionally absorb a userinfo prefix and a `.git` suffix, keeping the host enumeration intact. Rejected: switching to `node:url` `URL.parse()` (would normalise the legacy `*.visualstudio.com` host structure differently and risks regressing the existing `DefaultCollection` branch).
2. **Credential-warning emission** — Decision: module-scope boolean in a small new `remote-warning.ts`, emitted from `parseAzdoRemote()` (and `parseRepoName()` only if it parses independently) on the first call that observes userinfo. Rejected: process-wide `EventEmitter`, environment-variable opt-out (YAGNI), persisting "warned" state across processes (would make the message disappear after first run — bad UX).
3. **Multi-match aggregation** — Decision: have `pr-client.ts::listPullRequests()` return its full result set (it already does); push the "exactly one match" enforcement up into the command layer (`pr.ts`) where the multi-match error text per FR-006 can be assembled with the searched branch name. Rejected: enforcing uniqueness inside `pr-client.ts` (couples the API client to UX concerns).
4. **Help-text wording** — Decision: a single shared sentence ("`--pr-number <N>` — target the pull request with this numeric id. If omitted, the CLI uses the current git branch and matches against open pull requests whose source branch equals `refs/heads/<current branch>` in the auto-detected repository.") referenced by every `pr <sub>`. Rejected: per-command bespoke wording (drift risk).

### Phase 1 — Design & Contracts

**Prerequisites**: research.md complete.

1. **Entities** → see [data-model.md](./data-model.md). The change touches presentation, not domain; the only entity-shaped artefact is the `RemoteWarningEmitter` module state, documented there.
2. **Contracts** → see [contracts/cli-surface.md](./contracts/cli-surface.md). Defines: the help string referenced from `--pr-number` options, the exact zero-match error format (with searched branch), the exact multi-match error format (with branch + comma-listed PR numbers), and the credential-warning string.
3. **Quickstart** → see [quickstart.md](./quickstart.md). End-to-end local recipe with `git remote set-url` lines that reproduce the bug today and demonstrate the fix.
4. **Agent context update** — `update-agent-context.sh codex` is invoked at the end of `/speckit-plan` to refresh `AGENTS.md`'s "Active Technologies" section with the existing stack (no new tech declared).

### Phase 2 — Tasks (deferred)

`/speckit-tasks` will produce `tasks.md` next. Anticipated phase breakdown:

| Phase | Theme | Indicative count |
|-------|-------|------------------|
| Setup | Branch / dep audit (already clean) | 0–1 |
| Tests | Vitest fixtures for the URL matrix; multi-match + zero-match error contract tests; help-text contract test | 4–6 |
| Core | Regex update; new `remote-warning.ts`; multi-match aggregation move into `pr.ts` | 3–4 |
| Integration | None (no new API surface; existing pr-client unchanged) | 0 |
| Polish | README/AGENTS.md update if the help-text contract makes it user-visible; CHANGELOG entry | 1–2 |

## Post-design Constitution Re-check

Re-evaluated after drafting `research.md`, `data-model.md`, `contracts/cli-surface.md`, `quickstart.md`:

- No new runtime dependency introduced (IV ✅).
- No `any` and no untyped boundary (II ✅).
- The new `remote-warning.ts` is the smallest module that lets the warning behaviour be unit-tested in isolation; not a wrapper layer (V ✅).
- No expansion of command surface (III ✅); only existing help strings and error messages are edited.
- Exit codes remain meaningful: success = 0, non-zero on multi-match (FR-006), unchanged on parse failure (I ✅).

**Result**: post-design check matches pre-design check — all five principles still pass with no justified violations. **Complexity Tracking** table omitted (no violations to justify).

## Risk register & mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Regex tweak silently widens host set (e.g. matches `dev.azure.com.evil.example`). | Low | Anchor host segment with `\\b` boundaries and keep the explicit literal host list; add a negative test case (`https://user@dev.azure.com.evil/...` must be rejected). |
| Credential warning leaks any character of the password. | Low | Static string only; unit test the emitter against a `user:token@` URL and assert the emitted text contains neither the user nor the token. |
| Multi-match error path changes behaviour for the existing single-match happy path. | Low | Keep the single-match code path untouched and gate the new error path on `results.length > 1`. Add a regression test pinning current `pr status` output on the single-match case. |
| The "byte-identical for non-userinfo URLs" promise (FR-007) regresses through an accidental help-text change. | Medium | Add a snapshot-style assertion on the rendered help text for every `pr <sub> --help` to catch unintended drift. |

## Open questions deferred to `/speckit-tasks`

None. The spec is precise and the clarifications resolved the only two UX/security decisions.
