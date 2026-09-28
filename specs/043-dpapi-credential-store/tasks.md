# Tasks: 043-dpapi-credential-store

**Gate**: `npm test && npm run lint` must pass before the PR is marked ready.

## Phase 1 — selection
- [X] **T001** `credential-store-kind.ts`: `parseCredentialStore()` (FR-001, US-4).
- [X] **T002** `config-store.ts` + `types/work-item.ts`: `credentialStore` key, validation, excluded from `org-copy default` (FR-001).
- [X] **T003** `commands/config.ts`: help text; wizard skips the key.

## Phase 2 — the store
- [X] **T004** `dpapi-binding.ts`: lazy addon load (FR-009).
- [X] **T005** `dpapi-store.ts`: `DpapiEntry` — naming, entropy, round trip, atomic write, messages (FR-003, FR-004, FR-006).
- [X] **T006** `credential-store.ts`: `activeCredentialStore()`, `probeBackend()`, `entryFor()`, migration guard, `wrapUnavailable` (FR-002, FR-005, FR-007).
- [X] **T007** `types/credential.ts`: `windows-dpapi`, custom message, Credential Manager hint (FR-008).

## Phase 3 — tests
- [X] **T008 [P]** `tests/unit/dpapi-store.test.ts`.
- [X] **T009 [P]** `tests/unit/credential-store.dpapi.test.ts`.
- [X] **T010 [P]** `tests/unit/dpapi-binding.test.ts` (real addon; Windows branch runs only on win32).
- [X] **T011 [P]** `tests/unit/config-store.test.ts`: `credentialStore` cases.

## Phase 4 — docs
- [X] **T012** `docs/authentication.md`, `docs/commands.md`, `docs/changelogs/unreleased.md`.
- [X] **T013** `CLAUDE.md` + `AGENTS.md` Recent Changes.

## Phase 5 — gate
- [X] **T014** `npm test && npm run lint` green.
- [ ] **T015** Manual matrix research.md R-3 on a real Windows host (owner).
