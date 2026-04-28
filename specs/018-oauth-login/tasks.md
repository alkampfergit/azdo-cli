---
description: "Task list for OAuth login for azdo-cli (issue #37)"
---

# Tasks: OAuth login for azdo-cli

**Input**: Design documents from `/specs/018-oauth-login/`
**Prerequisites**: plan.md (loaded), spec.md (loaded), research.md (loaded), data-model.md (loaded), contracts/auth-service.md (loaded), contracts/cli-surface.md (loaded), quickstart.md (loaded)

**Tests**: Tests are INCLUDED — plan.md "Test strategy" enumerates the exact unit + integration files; spec.md mandates independent-test criteria per story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Story label (US1 / US2 / US3) — required for story-phase tasks only

## Path Conventions

Single-project layout per plan.md "Project Structure":
- Source: `src/` at repo root
- Tests: `tests/unit/`, `tests/integration/`
- Docs: `docs/` (new directory for FR-015 guide)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project surface that the rest of the feature builds on. No code logic yet.

- [ ] T001 Create `docs/` directory at repo root (will hold the FR-015 OAuth app registration guide); `mkdir -p docs && touch docs/.gitkeep` if no other docs file is being added in T046
- [ ] T002 [P] Create empty file shells with module-level JSDoc placeholders for the new TypeScript modules so later parallel tasks can edit them without race conflicts: `src/types/oauth.ts`, `src/lib/pkce.ts`, `src/services/oauth-config.ts`, `src/services/oauth-flow.ts`, `src/services/oauth-device-code.ts`, `src/services/oauth-token-refresh.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Discriminated-union credential envelope + audit vocabulary. Every user story below reads/writes through these. **No user-story task may start until this phase is complete.**

- [ ] T003 Update `src/types/credential.ts` to add the `StoredCredential` discriminated union (`StoredPatCredential` + `StoredOAuthCredential`) and the `UsableCredential` union exactly as specified in `data-model.md` E1 and `contracts/auth-service.md`; do NOT remove any existing exports
- [ ] T004 Update `src/types/credential.ts` to add the error classes from `contracts/auth-service.md` "Error contract": `CredentialMissingError`, `CredentialRefreshError` (with `reason` enum + `userMessage`), and keep the existing `CredentialStoreUnavailableError`
- [ ] T005 Update `src/services/credential-store.ts` write path to JSON-encode the envelope `{kind, ...}` per `data-model.md` E1 validation rules (kind required, oauth requires accessToken/expiresAt>issuedAt and ≤24h, pat requires non-empty token); keep service `azdo-cli` account `pat:<org>` slot unchanged (R9)
- [ ] T006 Update `src/services/credential-store.ts` read path: a non-JSON entry OR JSON without `kind` returns `{kind:'pat', token:<raw>}` (legacy compat); JSON with unknown `kind` throws `CredentialStoreUnavailableError` and emits one `unknown-kind` audit event; valid JSON returns the parsed envelope. Do NOT auto-rewrite legacy entries on read.
- [ ] T007 [P] Add a unit test `tests/unit/credential-store.kind-envelope.test.ts` covering: round-trip OAuth envelope; round-trip PAT envelope; legacy bare-PAT string read as `kind:'pat'`; rewrite-as-envelope ONLY on explicit re-store; unknown-kind throws
- [ ] T008 Extend `src/services/audit-log.ts` with the R10 event vocabulary: `oauth-login-started`, `oauth-login-success`, `oauth-login-failed` (with `reason` enum), `oauth-refresh-success`, `oauth-refresh-failed` (with `reason` enum), `oauth-logout`. Keep JSON-lines format unchanged. Reject any attempt to log `accessToken` / `refreshToken` / `token` fields (defence-in-depth — token material never in audit per existing rule).
- [ ] T009 [P] Add a unit test `tests/unit/audit-log.oauth-events.test.ts` confirming each new event kind round-trips through the JSON-lines reader and that any caller-supplied `accessToken`/`refreshToken` field is stripped before write

**Checkpoint**: Foundation ready — user-story phases can now run.

---

## Phase 3: User Story 1 — One-command browser login (Priority: P1) 🎯 MVP

**Goal**: A user with no stored credential runs `azdo auth login --org <O>`, the browser opens, they consent, the loopback callback receives the auth code, the CLI exchanges it for an access+refresh token via Entra v2, persists the OAuth envelope, and a follow-up authenticated CLI command works without re-prompting.

**Independent Test**: Spec acceptance scenarios 1–3 of US1. Verifiable via `tests/integration/oauth-loopback-roundtrip.test.ts` (fake AzDO IdP, real `node:http`, real keyring) and a manual quickstart walkthrough.

### Tests for User Story 1 (write FIRST, ensure they FAIL before implementation)

- [ ] T010 [P] [US1] Unit test `tests/unit/pkce.test.ts` — verifier 43–128 base64url chars, no padding, `randomBytes` source; challenge = `BASE64URL(SHA-256(verifier))`; method always `S256`; collision rate sanity (10k iterations → all distinct)
- [ ] T011 [P] [US1] Unit test `tests/unit/oauth-flow.callback-validation.test.ts` — state mismatch → reject with `state-mismatch` reason; redirect URI exact-match check; only loopback `127.0.0.1` accepted (rejects `localhost`, `0.0.0.0`); only `/callback` path accepted; OS-assigned port (`server.listen(0)`) round-trips
- [ ] T012 [P] [US1] Unit test `tests/unit/oauth-config.client-id-resolution.test.ts` — default shipped `DEFAULT_OAUTH_CLIENT_ID` used when no override; `AZDO_OAUTH_CLIENT_ID` env wins over config-file `oauth.clientId`; CLI `--client-id` wins over both; same precedence for `tenantId`; FR-016 baseline scope resolution; loopback-only redirect URI policy
- [ ] T013 [P] [US1] Unit test `tests/unit/oauth-token-refresh.test.ts` — two concurrent `refreshIfNeeded(org)` → exactly one network exchange (single-flight); failure path throws `CredentialRefreshError` with FR-014 `userMessage` and does NOT delete the stored credential; `~/.azdo/.locks/<org>.refresh` file lock acquired and released
- [ ] T014 [P] [US1] Unit test `tests/unit/auth-command.flag-routing.test.ts` — `azdo auth login` (no flags) routes to OAuth path; `--use-pat` routes to PAT prompt path; `--use-pat --device-code` exits 2 with mutual-exclusion message; `--use-pat --client-id` exits 2; `--from-stdin` with OAuth flags emits a warning and falls back to PAT
- [ ] T015 [US1] Integration test `tests/integration/oauth-loopback-roundtrip.test.ts` — full successful login against a fake AzDO IdP (local `http` server emulating `/authorize` + `/token`), real `node:http` loopback callback, real `@napi-rs/keyring` (provisioned by `scripts/setup-keyring.sh`); follow-up authenticated API call succeeds; restart Node process → credential still resolves; access-token expiry + valid refresh token → silent refresh succeeds

### Implementation for User Story 1

- [ ] T016 [P] [US1] Implement `src/types/oauth.ts` with `PkceParams`, `AuthorizationRequest`, `TokenResponse`, `AuthorizationSession` (per `data-model.md` E3), `DeviceCodeResponse`, and the audit event-kind union; export everything as named exports with explicit types (no `any`)
- [ ] T017 [P] [US1] Implement `src/lib/pkce.ts` with `generateVerifier()`, `challengeForVerifier(verifier)`, and `randomState(byteLen=16)` — `node:crypto` only, base64url no-pad encoding helper
- [ ] T018 [US1] Implement `src/services/oauth-config.ts` exporting `DEFAULT_OAUTH_CLIENT_ID` (placeholder string `__SHIPPED_CLIENT_ID__` until the maintainer fills it per FR-015 — TODO comment with exact instructions), `resolveOAuthConfig(opts)` that returns `{clientId, tenantId, scopes[], clientIdSource}` using the precedence flag > env (`AZDO_OAUTH_CLIENT_ID` / `AZDO_OAUTH_TENANT_ID`) > config (`oauth.clientId` / `oauth.tenantId`) > default; `validateRedirectUri(uri)` enforces `^http://127\.0\.0\.1:\d+/callback$`; `defaultScopes()` returns the FR-016 baseline (`vso.work`, `vso.work_write`, `vso.code`, plus `offline_access`, `openid`)
- [ ] T019 [US1] Implement `src/services/oauth-flow.ts`: `runAuthCodeFlow(session, deps)` opens `node:http` server on `127.0.0.1:0`, builds `AuthorizationSession`, opens browser via existing `services/browser-open.ts`, awaits exactly one GET to `/callback`, validates `state` and path before reading `code`, exchanges code at the Entra v2 token endpoint via native `fetch` (form-encoded, R5), shuts down listener on success/error/timeout (default 5 min), returns `StoredOAuthCredential`. Inject `tokenEndpoint` / `authorizationEndpoint` for tests (plan.md test strategy). Render minimal inline HTML on success/error per R14 (no external assets).
- [ ] T020 [US1] Implement `src/services/oauth-token-refresh.ts`: `refreshIfNeeded(org, current)` with the per-process `Map<org, Promise<...>>` single-flight ledger AND the cross-process `~/.azdo/.locks/<org>.refresh` lock file (plan.md Concurrency: `O_CREAT|O_EXCL`, 5s spin-wait, last-writer-wins). Failures translated to `CredentialRefreshError` with `reason` enum and the FR-014 `userMessage` (`"refresh token rejected for org <O>; run \`azdo login --org <O>\` to re-authorise"` verbatim). Audit `oauth-refresh-success` / `oauth-refresh-failed`. NEVER delete the stored credential on failure (FR-014 hard rule).
- [ ] T021 [US1] Update `src/services/auth.ts` to implement the `AuthService` interface from `contracts/auth-service.md`: `resolveCredential(org)` follows FR-007a precedence (`AZDO_PAT` env first, then keyring; OAuth-kind triggers refresh check with 60s skew margin); `login(org, opts)` dispatches OAuth (default) vs PAT (`useProvider==='pat'`); `logout(opts)` deletes per-org or all; `status()` returns metadata-only `StatusReport`; throw exactly the three documented error classes. Keep existing free helpers (`promptForPat`, `validatePatAgainstAzdo`, `maskedDisplay`, `normalizePat`) as internal helpers.
- [ ] T022 [US1] Update `src/commands/auth.ts` to wire the new flags from `contracts/cli-surface.md`: `--use-pat`, `--device-code`, `--client-id`, `--tenant-id`, `--scopes`, `--org`, `--from-stdin`, `--browser`. Enforce mutual-exclusion exits (code 2: `--use-pat`+`--device-code`, `--use-pat`+`--client-id|--tenant-id|--scopes`); status messages to stderr, exit codes 0/1/2 per the contract. The default (no flags) path now opens the browser — DELIBERATE behaviour change per FR-012; mention this in the long help body.
- [ ] T023 [US1] Update `src/services/credential-store.ts` to emit the `oauth-logout` audit event from `logout()` (per-org branch); ensure the lingering-lock-file cleanup (best-effort delete of `~/.azdo/.locks/<org>.refresh`) happens during logout per `contracts/auth-service.md` `logout` invariant 3
- [ ] T024 [US1] Update `src/services/azdo-client.ts` and `src/services/pr-client.ts` (the read-side callers per `contracts/auth-service.md` "Compatibility") to use `AuthService.resolveCredential(org)` and consume `UsableCredential` (handle both `kind:'pat'` and `kind:'oauth'` — for OAuth use the `bearerToken` directly as the `Authorization: Bearer ...` header value)

**Checkpoint**: User Story 1 (P1 MVP) is fully functional and independently testable — quickstart §1 (browser login) end-to-end works.

---

## Phase 4: User Story 2 — Headless / no-browser environment (Priority: P2)

**Goal**: A user on a host without a browser (or with explicit `--device-code`) sees a user-code + verification URL, completes the consent on a separate device, and the CLI on the headless host receives the credential and persists it.

**Independent Test**: Spec acceptance scenarios 1–2 of US2 (no `DISPLAY` → device-code auto-selected; `--device-code` overrides on a host with a browser).

### Tests for User Story 2

- [ ] T025 [P] [US2] Unit test `tests/unit/oauth-device-code.test.ts` — `POST /devicecode` request shape (`client_id`, `scope`); polling honours `interval` from response; `authorization_pending` → keep polling; `slow_down` → extend interval per RFC 8628 §3.5; `expired_token` → throw timeout error; success → returns the same `StoredOAuthCredential` shape as auth-code flow
- [ ] T026 [P] [US2] Unit test `tests/unit/auth-command.headless-detection.test.ts` — `isHeadless()` (no `DISPLAY` on Linux) auto-routes to device-code flow when no `--use-pat`; explicit `--device-code` forces device-code regardless of headless detection; on Win/Mac with browser-open failure the user gets the FR-010 error pointing at `--device-code`

### Implementation for User Story 2

- [ ] T027 [P] [US2] Implement `src/services/oauth-device-code.ts`: `runDeviceCodeFlow(session, deps)` calls Entra v2 `/devicecode` (R7), prints `user_code` + `verification_uri` to stderr (never stdout), polls `/token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code` every `interval` seconds, handles `authorization_pending` / `slow_down` / `expired_token` per RFC 8628, returns `StoredOAuthCredential`. Inject `tokenEndpoint` / `deviceCodeEndpoint` for tests.
- [ ] T028 [US2] Update `src/services/auth.ts` `login()` to choose between auth-code and device-code based on `flow` option and the existing `services/browser-open.ts` `isHeadless()` heuristic per R8; `flow:'auto'` → auth-code on browser hosts, device-code on headless; `flow:'device-code'` always device-code; emit `oauth-login-started` with `flow` field
- [ ] T029 [US2] Integration test `tests/integration/oauth-device-code-roundtrip.test.ts` — fake Entra `/devicecode` + `/token` server, simulated user "completing" the flow on a separate device after 2 polling cycles; verify polling cadence and `slow_down` extension; verify the resulting credential is the same envelope as US1

**Checkpoint**: User Stories 1 + 2 work independently. CI runners and SSH sessions can authenticate.

---

## Phase 5: User Story 3 — PAT remains a documented option (Priority: P3)

**Goal**: PAT login still works exactly as before; the published documentation states the minimum PAT scopes per CLI capability area; the OAuth feature does not break PAT users.

**Independent Test**: Spec acceptance scenarios 1–3 of US3. Verifiable via `tests/integration/auth-pat-still-works.test.ts` and a documentation review.

### Tests for User Story 3

- [ ] T030 [P] [US3] Integration test `tests/integration/auth-pat-still-works.test.ts` — fresh-install `azdo auth login --use-pat` prompt path produces the same final keyring state as before the feature (now wrapped in `{kind:'pat'}` envelope); legacy bare-PAT keyring entries continue to authenticate API calls without rewrite (read-tolerance rule); `AZDO_PAT` env var still wins per FR-007a
- [ ] T031 [P] [US3] Unit test `tests/unit/docs-pat-scope-table.test.ts` — parses `docs/oauth-app-registration.md` (or wherever the PAT scope table lives — see T046) and asserts the table contains rows for at least: Work Items read, Work Items write, Code read; asserts the FR-016 OAuth scope set in `oauth-config.ts` exactly mirrors the documented PAT scopes (single-source-of-truth invariant)

### Implementation for User Story 3

- [ ] T032 [US3] Verify `src/commands/auth.ts` `--use-pat` path is unchanged from current behaviour for users (PAT prompt, `--from-stdin`, `--browser` flags all behave identically); the only delta is the keyring envelope wrapping which is transparent to the PAT user. No new code expected here beyond what T022 already wired.
- [ ] T033 [US3] Update `src/services/auth.ts` `resolveCredential` to keep legacy bare-PAT entries readable indefinitely (depends on T006 read-tolerance) — confirm via test T030 that no existing PAT user is force-migrated on first invocation post-upgrade (FR-007 hard rule)

**Checkpoint**: All three stories independently functional. PAT users see no behavioural change.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, help text, audit, quickstart validation. Touches multiple stories.

- [ ] T034 [P] Update `src/commands/auth.ts` long help body to reference `docs/oauth-app-registration.md` (FR-015): "to use a self-registered OAuth app, see <link>; to register the project's shared app yourself, that same guide is the maintainer reference." Per `cli-surface.md` "Help-text invariants".
- [ ] T035 [P] Update `src/commands/auth.ts` `login --help` to list the FR-016 baseline OAuth scope set so a user can audit before consenting
- [ ] T036 [P] Update `src/commands/auth.ts` `status --help` to mention that `kind:'pat'` and `kind:'oauth'` may coexist across orgs (FR-007)
- [ ] T037 [P] Add a section to `README.md` under "Authentication" linking `docs/oauth-app-registration.md` and summarising: OAuth is default, `--use-pat` opt-in, headless via `--device-code`, both methods coexist
- [ ] T038 Update `specs/018-oauth-login/quickstart.md` (if any line points at speculative paths) to match the implemented flag set; keep the manual-validation walkthrough for both browser and headless
- [ ] T039 Run quickstart.md validation manually on Linux+browser host (US1 scenario), Linux+no-DISPLAY host (US2 scenario), and PAT-only path (US3 scenario); record the runtime numbers (SC-001 < 2 min, SC-004 < 5 s silent refresh) in a one-line PR comment
- [ ] T040 [P] Code cleanup: ensure no `any` in any new module (Constitution II); run `npm run typecheck` and `npm run lint`; fix any warnings introduced by this feature only (do not refactor unrelated code)
- [ ] T041 [P] Confirm no new runtime dependencies were added to `package.json` (Constitution IV / V — the OAuth flow is built-ins-only per plan.md "New runtime dependencies: none")
- [ ] T042 [P] Run `npm run test` (Vitest): all unit + integration tests pass on Linux CI runner; `tests/integration/oauth-loopback-roundtrip.test.ts` and `tests/integration/oauth-device-code-roundtrip.test.ts` use the fake IdP and never hit real Entra
- [ ] T043 Run `scripts/setup-keyring.sh` in CI to confirm the keyring backend is available before integration tests; document the dependency in `tests/integration/README.md` (create if missing) so future contributors know
- [ ] T044 Add an end-to-end regression test `tests/integration/auth-multi-org-isolation.test.ts` covering FR-009: log into orgs A and B; running a command against org C must produce the FR-009 "log in to `<C>`" error and MUST NOT silently use A's or B's credential
- [ ] T045 [P] Verify the audit log captures the full event timeline for a clean US1 login (`oauth-login-started` → `oauth-login-success`) and a successful refresh (`oauth-refresh-success`); inspect a real audit log file produced by the integration test and assert no token material is present (defence-in-depth check)

---

## Phase 7: FR-015 OAuth app registration guide

**Purpose**: Standalone deliverable — the markdown guide. Listed separately because it serves both the maintainer (to mint `DEFAULT_OAUTH_CLIENT_ID` for T018) AND end users on locked-down tenants. The guide is on the critical path for shipping (T018 is blocked on the maintainer producing the GUID using this guide).

- [ ] T046 Author `docs/oauth-app-registration.md` per FR-015. MUST cover end-to-end: which AzDO / Entra portal to use, the redirect URI to set (`http://127.0.0.1` loopback per RFC 8252 — note Entra requires "Mobile and desktop applications" platform), the scopes to grant (FR-016 baseline list — Work Items r/w, Code read, plus `offline_access` and `openid`), where to find the resulting `client_id` GUID, and tenant-policy gotchas (admin consent, conditional access). Two audiences clearly delineated: §1 "Maintainer — registering the project's shared OAuth app" and §2 "End user — registering your own app for the FR-013 override path". A first-time reader unfamiliar with AzDO app registration must be able to complete it on the first attempt.
- [ ] T047 Embed the PAT scope table referenced by FR-008 in `docs/oauth-app-registration.md` (or in a sibling `docs/pat-scopes.md` linked from there) — capability-by-capability rows: Work Items read, Work Items write, Code read for Pull Requests. This is the single source of truth for both PAT and OAuth scope sets per FR-016.
- [ ] T048 [BLOCKING for release, NOT for merge] Maintainer (per `speckit-gh` security rule, this is owner-driven, not bot-driven): register the project-owned Entra public OAuth app following T046 and supply the resulting `client_id` GUID to replace the `__SHIPPED_CLIENT_ID__` placeholder from T018. Until this is done, the released binary will fail OAuth flows out of the box; until merge it can ship as a placeholder so reviewers can exercise the override path via `AZDO_OAUTH_CLIENT_ID`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no dependencies; T001 + T002 in parallel
- **Phase 2 (Foundational)**: depends on Phase 1; T003 → T004 → (T005 ‖ T006) → T007; T008 → T009. **BLOCKS all user stories.**
- **Phase 3 (US1)**: depends on Phase 2 complete
- **Phase 4 (US2)**: depends on Phase 2 complete; **also depends on T019** (US2 reuses parts of `oauth-flow.ts`'s token-exchange shape) and **T021** (`AuthService.login()` flow routing). For practical implementation order, finish US1 implementation tasks T016–T024, then start US2.
- **Phase 5 (US3)**: depends on Phase 2 (T003–T007) only — independent of US1/US2 OAuth code paths
- **Phase 6 (Polish)**: depends on US1, US2, US3 implementation complete
- **Phase 7 (FR-015 guide)**: T046 + T047 can start as soon as Phase 1 is done (purely doc work); T048 BLOCKS the release (not the merge). T018 has a placeholder `client_id` that lets the merge happen without T048.

### User Story Dependencies

- **US1 (P1, MVP)**: depends on Phase 2 only; independently testable
- **US2 (P2)**: depends on Phase 2 + T019 + T021 (shared OAuth-flow scaffolding); independently testable once those are in
- **US3 (P3)**: depends on Phase 2 only; independently testable; can be developed entirely in parallel with US1 and US2 (PAT path is unchanged code-wise; deliverable is mostly docs + a regression test)

### Within Each User Story

- Tests written first (TDD per plan.md test strategy) — they MUST FAIL before implementation
- Types before services (`oauth.ts` before `oauth-flow.ts`)
- Services before commands (`auth.ts` service before `auth.ts` command)
- Read-side wiring (`azdo-client.ts`, `pr-client.ts`) last in the story

### Parallel Opportunities

- T002 module shells: parallel to themselves
- T007 + T009 unit tests: parallel
- T010–T015 US1 tests: all parallel (different files)
- T016 + T017 (`types/oauth.ts` + `lib/pkce.ts`): parallel; both feed T019/T020
- T025 + T026 US2 tests: parallel
- T030 + T031 US3 tests: parallel
- T034–T037 polish help-text/README updates: parallel
- T040–T042 + T045 final-pass checks: parallel
- T046 + T047 docs: parallel

---

## Parallel Example: User Story 1 tests

```bash
# All US1 tests can be authored in parallel (different files, no implementation yet):
Task: "Unit test for PKCE helpers in tests/unit/pkce.test.ts"
Task: "Unit test for OAuth callback validation in tests/unit/oauth-flow.callback-validation.test.ts"
Task: "Unit test for OAuth config resolution in tests/unit/oauth-config.client-id-resolution.test.ts"
Task: "Unit test for token-refresh single-flight in tests/unit/oauth-token-refresh.test.ts"
Task: "Unit test for auth command flag routing in tests/unit/auth-command.flag-routing.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 (setup) → Phase 2 (foundational types + envelope + audit) → Phase 3 (US1).
2. After T024, `azdo auth login` against a host with a browser is fully working end-to-end.
3. **STOP and VALIDATE**: run `tests/integration/oauth-loopback-roundtrip.test.ts` + manual quickstart §1.
4. Ready to demo as MVP — issue #37's headline value (no more PAT minting in the AzDO web UI).

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. Add US1 → independently test → MVP demo
3. Add US2 → independently test (headless) → CI / SSH coverage demo
4. Add US3 → independently test (PAT regression + docs review)
5. Phase 6 polish → CI green, help text complete, multi-org regression
6. Phase 7 guide + maintainer registers the shared app → ready to release

### PR scope

This feature merges into `develop` (gitflow integration branch) as a single PR `Closes #37`. Tag/release is owner-driven via a separate release issue per the project's gitflow rule — not part of this PR.

---

## Notes

- **No new runtime dependencies.** The OAuth flow is built-ins only (`node:crypto`, `node:http`, native `fetch`); the keyring binding `@napi-rs/keyring` and command framework `commander` are already present. Any task that wants to add a runtime dep is out-of-scope and must be raised on the issue first.
- **Token material never logged.** Audit log, console output, error messages, and HTML callback page must never include `accessToken` / `refreshToken` / PAT values. The masking patterns from `services/auth-masking.ts` apply.
- **No cross-story coupling that breaks independence.** US3 ships the PAT scope table and PAT regression test even if US1/US2 are not yet merged; US2 device-code reuses US1's token-exchange shape but the unit tests inject a fake endpoint so US2 can be authored against a stubbed US1.
- **Constitution gates re-checked at PR time** — plan.md "Gate result (post-design): PASS" must remain valid; flag any task that introduces a `any`, a new dependency, or a hidden command surface.
