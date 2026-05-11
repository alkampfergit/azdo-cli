# Quickstart: OAuth login for azdo-cli

**Branch**: `018-oauth-login`

This document is the developer-facing walkthrough that proves the feature works end-to-end after Phase 2 (`/speckit-tasks`) and the implementation it drives are in place. It doubles as the manual smoke-test script and the integration-test storyboard.

## Prereqs

1. Node 18+ installed.
2. `npm ci && npm run build` from the repo root.
3. The Entra OAuth app registered per `docs/oauth-app-registration.md` (FR-015 deliverable). The maintainer's GUID is hard-coded in `src/services/oauth-config.ts` as `DEFAULT_OAUTH_CLIENT_ID`.
4. For Linux dev environments without a desktop session, a Secret Service provider is running (the existing `scripts/setup-keyring.sh` does this in CI).

## US-1 — One-command browser login (P1)

**Goal**: prove FR-001, FR-002, FR-003, FR-009, FR-013, FR-016 end-to-end.

Steps:

1. Confirm clean slate: `./dist/index.js auth status --json` should not list the target org, OR
   `./dist/index.js auth logout --org <O>` first.
2. Run `./dist/index.js auth login --org <O>`.
3. The CLI:
   - prints "opening browser…" then "waiting for callback at http://127.0.0.1:<port>…" to stderr.
   - opens the system browser at the Entra `/authorize` URL.
4. In the browser, sign in with an account that has access to org `<O>`. Confirm the consent dialog lists exactly the FR-016 scopes (`vso.work`, `vso.work_write`, `vso.code`, plus `offline_access` and `openid`).
5. Browser tab shows "Login complete — you can close this tab".
6. CLI exits `0` with stderr `logged in to <O> as <upn>`.
7. Inspect the keyring entry (use `azdo auth status` for a non-secret view; do NOT use `secret-tool` etc. — token material is private). Output should show `kind: 'oauth'`, the account id, and a future `expiresAt`.
8. Run any read command, e.g. `./dist/index.js work-item get-item 12345 --org <O>`. Should succeed using the OAuth bearer token.
9. Open a fresh shell. Re-run the same read command. Should still succeed (credential persisted across processes).
10. Inspect `~/.azdo/audit.log`: should contain `oauth-login-started`, `oauth-login-success`, no token material.

Pass criteria: every assertion above true. Total wall-clock for steps 1–7 under 2 minutes (SC-001).

## US-2 — Headless / device-code flow (P2)

**Goal**: prove FR-005 plus the auto-detection heuristic.

Two sub-flavours:

### 2a — Auto-detected headless (Linux, no `DISPLAY`)

1. `unset DISPLAY` (or run inside a container without a desktop).
2. `./dist/index.js auth login --org <O>`.
3. The CLI:
   - detects headless via the existing `services/browser-open.ts` heuristic.
   - prints to stderr a user code and verification URL: e.g.
     `to sign in, go to https://microsoft.com/devicelogin and enter code DEVC-XXXX`.
   - polls the token endpoint at the IdP-supplied interval.
4. On a separate device (laptop), open the verification URL, enter the code, complete sign-in.
5. Within a poll interval, the CLI exits `0` with the same `logged in to <O>` line.
6. Same post-conditions as US-1 (steps 7–10).

### 2b — Explicit `--device-code` on a host with a browser

1. `./dist/index.js auth login --org <O> --device-code`.
2. CLI uses device-code regardless of browser availability.
3. Otherwise identical to 2a steps 4–6.

Pass criteria: the user code + verification URL appear before the polling starts; the CLI never opens a browser; success state is identical to US-1.

## US-3 — PAT remains a documented option (P3)

**Goal**: prove FR-007, FR-008, FR-015.

Steps:

1. `./dist/index.js auth login --org <O> --use-pat`.
2. The CLI prompts for a PAT (existing behaviour, unchanged).
3. Paste a PAT minted with the scopes from the FR-008 table (Work Items r/w, Code read for PRs).
4. CLI exits `0`. `auth status` reports `kind: 'pat'` for `<O>`.
5. Read `docs/oauth-app-registration.md`:
   - section "For end users registering their own OAuth app" walks through the AzDO portal steps.
   - section "For the project maintainer producing the shared client_id" mirrors the same steps.
   - section "PAT scope reference" reproduces the FR-008 scope table.

Pass criteria: doc is self-contained (no external links required to complete registration); a developer who has never registered an AzDO OAuth app can finish on the first attempt.

## R-1 — Refresh failure surfaces clearly (FR-014)

**Goal**: prove FR-014's "surface, do not silently delete + re-prompt" rule.

Steps:

1. Complete US-1 to get a valid OAuth credential.
2. Manually invalidate the refresh path. Two ways:
   - **Production-grade**: revoke the user's session in the Entra portal.
   - **Test-friendly (integration test)**: edit the persisted envelope to set `expiresAt = 0` and replace `refreshToken` with `"invalid"`. (This is what the integration test does — the Entra portal route is for manual smoke-testing only.)
3. Run any authenticated command, e.g. `azdo work-item get-item 12345 --org <O>`.
4. CLI fails with exit `1` and stderr:
   `refresh token rejected for org <O>; run azdo login --org <O> to re-authorise.`
5. Inspect `auth status` — the credential entry is **still there** (FR-014 leaves it in place).
6. Inspect `~/.azdo/audit.log` — has an `oauth-refresh-failed` event with reason `invalid-grant` (or `revoked` for the portal-revocation case).
7. Run `azdo auth login --org <O>` to re-authorise. Subsequent commands succeed again.

Pass criteria: dead credential preserved; clear FR-014 message; audit event recorded; explicit re-login is the only path forward.

## R-2 — Multi-org isolation (FR-009)

**Goal**: prove credentials for distinct orgs do not bleed into each other.

Steps:

1. `azdo auth login --org A` (OAuth).
2. `azdo auth login --org B` (OAuth, different account if available).
3. `azdo auth status` lists both, each with the right account id.
4. `azdo auth logout --org A`.
5. Commands against `B` still work; commands against `A` fail with the FR-009 message ("log in to A").

Pass criteria: no cross-contamination, no surprise side effects on the unaffected org.

## R-3 — Concurrent refresh (Edge Case)

**Goal**: prove the single-flight + lock-file approach in `plan.md` Concurrency.

Steps (integration test only):

1. Start with a stored OAuth credential whose `expiresAt < now`.
2. Spawn three CLI processes in parallel, each invoking a read command for the same org.
3. Observe via the test harness: exactly one token-endpoint network call to the IdP; all three commands succeed.
4. The on-disk credential after settling carries one consistent fresh `accessToken`.

Pass criteria: no duplicate credential entries; no garbled JSON; all three exit `0`.

## What this quickstart deliberately does NOT cover

- Performance benchmarking — SC-001 / SC-004 are validated manually with a wall clock during US-1 / R-1.
- The exact GUID of the shared OAuth app — that's a maintainer concern in `docs/oauth-app-registration.md`, not a runtime check.
- Tagging or release behaviour — out of scope (gitflow-owned per repo policy).
- Non-supported OS-keychain platforms — the spec intentionally scopes to Win/Mac/Linux Secret Service.
