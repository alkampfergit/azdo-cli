# Registering the OAuth application for `azdo-cli`

`azdo-cli` authenticates against Azure DevOps using OAuth (Microsoft Entra v2.0 + PKCE) by default. Out of the box the CLI uses a **project-owned shared OAuth application** whose `client_id` ships with the released binary as a non-secret literal — security comes from PKCE, loopback-only redirect URI validation, the OAuth `state` binding, and least-privilege scopes (per [FR-013a](../specs/018-oauth-login/spec.md)).

This guide covers two audiences:

1. **§1 — Maintainer setup**: the `azdo-cli` project maintainer registering the **shared** OAuth application whose `client_id` is shipped with every release.
2. **§2 — End-user setup**: a user on a locked-down Azure tenant who needs to register their **own** OAuth application and point the CLI at it via the `AZDO_OAUTH_CLIENT_ID` environment variable or the `oauth.clientId` config key (the [FR-013](../specs/018-oauth-login/spec.md) override path).

Both audiences register the same kind of application — a public-client desktop application with PKCE, no client secret. The only difference is which `client_id` ends up in the user's `azdo-cli` installation.

> **Hard rule (FR-013a):** never embed a client secret in the released binary or commit one to the repository. PKCE replaces the client secret for public-client applications. If a registration form asks you to add a "client secret", **leave that field empty** — adding one defeats the security model and is not used by the CLI.

---

## §1 — Maintainer: registering the shared OAuth app

This procedure is done **once** by the project maintainer (or whoever cuts releases). The output is a single GUID — the `client_id` — that gets pasted into [`src/services/oauth-config.ts`](../src/services/oauth-config.ts) replacing the `__SHIPPED_CLIENT_ID__` placeholder before the next release.

### Prerequisites

- An Azure account with permission to register applications in the target Microsoft Entra tenant. For the shared CLI application this is the project maintainer's personal tenant or a project-owned tenant. **Do not** register in an end-user customer's tenant — that ties the CLI's identity to a single customer.
- A web browser to use the Microsoft Entra portal.

### Step-by-step

1. **Sign in to the Microsoft Entra admin centre.**
   Go to <https://entra.microsoft.com> and sign in with the account that owns the tenant you want the application registered in.

2. **Open the App registrations blade.**
   In the left-hand navigation: **Identity → Applications → App registrations**, then click **New registration** at the top.

3. **Fill in the registration form:**

   | Field | Value |
   | --- | --- |
   | **Name** | `azdo-cli` (or any human-readable name — this is shown to end users on the consent dialog) |
   | **Supported account types** | **Accounts in any organisational directory (Any Microsoft Entra ID tenant — Multitenant)**. Required so users on any tenant can authenticate against their own AzDO organisations. |
   | **Redirect URI — Platform** | `Public client/native (mobile & desktop)` |
   | **Redirect URI — value** | `http://127.0.0.1` *(no port, no path — Entra accepts this as a loopback redirect family per RFC 8252)* |

   Click **Register**.

4. **Copy the Application (client) ID.**
   On the application overview page, copy the GUID labelled **Application (client) ID** — for example, `8a1b2c3d-4e5f-6789-0abc-def123456789`. **This is the value that goes into `src/services/oauth-config.ts`** as `DEFAULT_OAUTH_CLIENT_ID`.

5. **Configure authentication options.**
   In the left-hand nav, open **Manage → Authentication**.

   - Under **Redirect URIs**, confirm the entry `http://127.0.0.1` is present under **Mobile and desktop applications**. (If the registration form created the entry incorrectly, delete it and add it manually here.)
   - Under **Advanced settings → Allow public client flows**, set the toggle to **Yes**. *(This is what enables the device-code flow for headless hosts and the loopback-redirect flow for desktop logins. Without it, Entra rejects requests from the public client with `AADSTS7000218`.)*
   - Click **Save**.

6. **Configure API permissions (least-privilege per FR-016).**
   In the left-hand nav, open **Manage → API permissions**.

   - Click **Add a permission** → **Azure DevOps**.
   - Select **Delegated permissions** and tick **exactly** the following scopes:

     - `vso.work` — Read work items
     - `vso.work_write` — Read and write work items
     - `vso.code` — Read source code
     - **plus** the OpenID Connect basics: `offline_access` (needed for refresh tokens) and `openid` (required by Entra v2.0).

     `offline_access` and `openid` are added automatically by the CLI on each authorisation request — you do **not** need to pre-grant them in the registration. The three `vso.*` scopes **do** need to be on the permission list so users see them in the consent dialog.

   - **Do NOT** add `vso.full_access` (or any other broad scope). FR-016 explicitly forbids it; new feature scopes must be added to the published [PAT scope table](#pat-scope-table-canonical-source) first and existing OAuth users re-consent on next login.
   - Click **Add permissions**.
   - **Do not** click *Grant admin consent* — that's a tenant-admin operation that's only meaningful on a single tenant. The CLI is multi-tenant; consent is granted per user at login time.

7. **(Optional) Branding.**
   Under **Manage → Branding & properties**, you can set:

   - **Publisher domain** — the domain that hosts your verification page if you've gone through publisher verification. Optional but improves the consent dialog ("Verified publisher: …").
   - **Logo** — a small image shown on the consent dialog.

   These don't affect functionality. Skip unless you have time to polish.

8. **Update the CLI source.**
   Open [`src/services/oauth-config.ts`](../src/services/oauth-config.ts) and replace the placeholder:

   ```ts
   export const DEFAULT_OAUTH_CLIENT_ID = '__SHIPPED_CLIENT_ID__';
   ```

   with the GUID from step 4:

   ```ts
   export const DEFAULT_OAUTH_CLIENT_ID = '8a1b2c3d-4e5f-6789-0abc-def123456789';
   ```

   Commit, raise a release PR (per the project's gitflow), and ship.

That's it for the maintainer.

### Post-registration smoke test

Before merging the GUID, run a clean install and exercise the flow:

```bash
npm run build
node dist/index.js auth login --org <some-org> --client-id <NEW_GUID>
```

You should be redirected to a Microsoft sign-in page, and after consent see "Logged in to <org> via OAuth (auth-code)" on stdout. If the flow fails with `AADSTS7000218`, double-check **Allow public client flows** in step 5.

---

## §2 — End user: registering your own OAuth app (locked-down tenant)

Use this path when:

- Your organisation has disabled multi-tenant applications in Microsoft Entra (the default `azdo-cli` shipped app is multi-tenant).
- Your conditional-access policy prevents the shared `azdo-cli` app from running.
- You prefer to own the OAuth app's audit trail in your own tenant.
- The maintainer of `azdo-cli` has not yet registered the shared app and the CLI's `DEFAULT_OAUTH_CLIENT_ID` is still the placeholder.

The procedure is the same as §1 but ends with you setting an environment variable instead of editing the CLI source.

### Step-by-step

1. **Sign in to the Microsoft Entra admin centre** (<https://entra.microsoft.com>) **with an account that has permission to register applications in your tenant**. If you don't, ask your Azure / Entra administrator to follow this section on your behalf.

2. **Register the application** (same form as §1 step 3):

   | Field | Value |
   | --- | --- |
   | Name | `azdo-cli (personal)` or any human-readable name |
   | Supported account types | **Accounts in this organisational directory only (Single tenant)** — this scopes the app to your tenant. |
   | Redirect URI — Platform | `Public client/native (mobile & desktop)` |
   | Redirect URI — value | `http://127.0.0.1` |

   Click **Register**.

3. **Copy your Application (client) ID** and your **Directory (tenant) ID** from the overview page. You'll need both.

4. **Configure authentication** (same as §1 step 5):
   - **Manage → Authentication → Allow public client flows = Yes** → **Save**.

5. **Add the AzDO scopes** (same as §1 step 6):
   - **Manage → API permissions → Add a permission → Azure DevOps → Delegated permissions** → tick `vso.work`, `vso.work_write`, `vso.code`. Click **Add permissions**.
   - On a locked-down tenant the registration may need **admin consent**. Click **Grant admin consent for <Tenant Name>** if you have permission, otherwise ask your administrator. Without consent the user will see "AADSTS65001: The user or administrator has not consented to use the application" on first login.

6. **Tell the CLI to use your registration.**
   On the host where you'll run `azdo-cli`, set both environment variables:

   ```bash
   export AZDO_OAUTH_CLIENT_ID="<your client id GUID>"
   export AZDO_OAUTH_TENANT_ID="<your tenant id GUID>"
   ```

   Or persist them via the CLI config:

   ```bash
   # (config keys — pending first-class wiring; for now use env vars)
   ```

   Then log in:

   ```bash
   azdo auth login --org <your-azdo-org>
   ```

   The browser opens to your tenant's sign-in page, you consent to the app, and the CLI persists the resulting credential under your OS keyring like any other login.

7. **(One-time only) Verify the credential resolved.**

   ```bash
   azdo auth status --org <your-azdo-org>
   ```

   should show `kind: oauth`, your account id, and an expiry timestamp.

### Per-invocation override

If you don't want to set env vars permanently, you can pass the override per `login`:

```bash
azdo auth login --org <org> \
  --client-id <your-client-id> \
  --tenant-id <your-tenant-id>
```

The override is used for that single login flow; the persisted credential remembers the tenant id so subsequent silent refreshes use the right endpoint without you re-passing the flag.

---

## Tenant-policy gotchas

These are the failure modes most often hit on locked-down tenants. Read these before following §2 if your IT department is strict.

| Symptom (error code from Entra) | Cause | Fix |
| --- | --- | --- |
| `AADSTS50020` "User account from identity provider …" | The shared multi-tenant `azdo-cli` app is blocked from the user's tenant. | Use §2 — register a single-tenant app in your own tenant. |
| `AADSTS50105` "The signed in user is not assigned to a role for the application" | The tenant requires explicit assignment under **Enterprise applications → Users and groups**. | Ask the Entra admin to assign your user (or the appropriate group) to the application. |
| `AADSTS65001` "The user or administrator has not consented to use the application" | First-time use on a tenant that requires admin consent. | An Entra admin must visit the consent prompt for the application once (e.g. by signing in themselves first, or via the *Grant admin consent* button on the API permissions page). |
| `AADSTS7000218` "The request body must contain the following parameter: 'client_assertion' or 'client_secret'" | **Allow public client flows** is set to **No** on the registration. | §1 / §2 step 4 — toggle it to **Yes**. |
| `AADSTS500113` "No reply address is registered" | The redirect URI on the registration does not match what the CLI sends. | Add `http://127.0.0.1` exactly under **Authentication → Mobile and desktop applications**. The CLI binds an OS-assigned port and Entra accepts any port under that loopback host. |
| `AADSTS90094` "The grant requires admin permission" | Conditional access requires admin consent on every refresh. | Either grant admin consent once for the app, or fall back to `--use-pat`. |
| Browser opens, user signs in, but the CLI stays on "waiting for callback" | The consent flow redirected to a different host (e.g. `localhost` instead of `127.0.0.1`), or a firewall is blocking the loopback. | Confirm the redirect URI on the registration is exactly `http://127.0.0.1` (no port, no path). The CLI strictly validates loopback (FR-013a). |

---

## PAT scope table (canonical source)

`azdo-cli` uses these Azure DevOps scopes **for both PAT and OAuth** — the table below is the single source of truth referenced by FR-008 (PAT minimum scopes) and FR-016 (OAuth scope mirroring). When a future CLI feature needs an additional scope it must be added to this table first; existing OAuth users will re-consent on next login.

| Scope | OAuth scope string | What it covers in the CLI |
| --- | --- | --- |
| Work Items (read) | `vso.work` | `azdo get-item`, `azdo list-fields`, `azdo comments` (list), markdown-field reads |
| Work Items (read+write) | `vso.work_write` | `azdo upsert`, `azdo set-field`, `azdo set-md-field`, `azdo assign`, `azdo set-state`, `azdo comments` (add), attachment uploads/downloads |
| Code (read) | `vso.code` | `azdo pr` (status, comments, list, threads, mentions) — sufficient for everything the PR commands currently expose because they all read PR metadata + diffs |

Plus the Entra v2.0 OpenID Connect basics that are NOT Azure-DevOps-specific:

| Scope | Purpose |
| --- | --- |
| `offline_access` | Required by Entra to issue a refresh token. Without it, the CLI cannot silently refresh — every command past the access-token lifetime would re-prompt. |
| `openid` | Required by Entra v2.0 when requesting any v2.0 resource scope. Adds no privileges. |

For PAT users, the equivalent AzDO PAT scopes (set in the AzDO web UI under **User settings → Personal access tokens**) are:

| OAuth scope | PAT scope label in the AzDO UI |
| --- | --- |
| `vso.work` | **Work Items (read)** |
| `vso.work_write` | **Work Items (read & write)** |
| `vso.code` | **Code (read)** |

A PAT minted with **only** *Work Items (read & write)* and *Code (read)* is sufficient for every CLI command the project ships today. Do **not** mint a PAT with *Full access* — match the OAuth principle of least privilege.

---

## What this guide does NOT cover

- **Custom domains / vanity sign-in URLs** — out of scope; Entra v2.0's standard endpoints are sufficient.
- **Service principal / app-only authentication** — `azdo-cli` is a user-interactive CLI; service principals don't apply. Use a PAT under a service account if you need automation auth.
- **Hotfix / emergency bypass via `--use-pat`** — that's covered by the [main authentication doc](authentication.md) and FR-007.

---

## See also

- [Feature spec — OAuth login](../specs/018-oauth-login/spec.md) (FR-001 … FR-016)
- [Implementation plan](../specs/018-oauth-login/plan.md)
- [Phase 0 research — IdP, flow, scopes](../specs/018-oauth-login/research.md) (R1, R6, R11, R12)
- [Authentication overview](authentication.md)
- [Microsoft Entra app registration docs](https://learn.microsoft.com/entra/identity-platform/quickstart-register-app) — upstream reference (verify against the current Entra portal UI before relying on screenshots in older revisions of that page)
