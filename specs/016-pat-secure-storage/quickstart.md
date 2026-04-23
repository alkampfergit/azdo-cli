# Quickstart — Secure PAT Storage and `auth` Command

End-to-end walkthrough of the feature from a user's perspective, plus a developer walkthrough of the relevant modules.

## User walkthrough

### First time, single-org

```bash
# No PAT anywhere yet.
$ unset AZDO_PAT
$ azdo work-item get 1234
Could not resolve an Azure DevOps organization. Options (in priority order):
  1. Pass --org <name> on the command line.
  2. Run this command from a git repo whose origin remote is an Azure DevOps URL.
  3. Run `azdo config set org <name>` once to set a persistent default.

# Setting a persistent default:
$ azdo config set org mycompany

# Auth for that org:
$ azdo auth
Opening https://dev.azure.com/mycompany/_usersSettings/tokens ...
Enter your Azure DevOps PAT: abcde**********vwxyz
PAT stored for org mycompany in macos-keychain.

# Now commands work without re-prompting:
$ azdo work-item get 1234
{...}
```

### Working across multiple orgs

```bash
# Org 2 stored separately:
$ azdo auth --org partner-co
Opening https://dev.azure.com/partner-co/_usersSettings/tokens ...
Enter your Azure DevOps PAT: abcde**********vwxyz
PAT stored for org partner-co in macos-keychain.

# `cd`-ing into a partner repo auto-switches:
$ cd ~/code/partner-co-project  # origin = https://dev.azure.com/partner-co/Proj/_git/repo
$ azdo work-item get 4321        # resolves org → partner-co (via git remote), uses partner-co PAT

# Override per-command:
$ azdo work-item get 1234 --org mycompany
```

### Inspect / rotate / remove

```bash
$ azdo auth status --json
{"org":"mycompany","backend":"macos-keychain","stored":true,"masked":"abcde**********vwxyz","updated_at":"2026-04-22T16:20:00Z"}

$ azdo auth --org mycompany        # prompts to overwrite
Overwrite existing PAT for org mycompany? [y/N] y
...

$ azdo auth logout --org partner-co
PAT removed for org partner-co.

$ azdo auth logout --all
PAT removed for org mycompany.
```

### Env var overrides everything

```bash
$ AZDO_PAT=xxx azdo work-item get 1234   # uses env var, ignores stored credential
```

## Developer walkthrough

### Module touch points

| Module | Change |
|---|---|
| `src/services/credential-store.ts` | Multi-org keying via `Entry("azdo-cli", "pat:<org>")`. New `CredentialStoreUnavailableError`. Functions take `org`. |
| `src/services/org-resolver.ts` | **NEW** — `resolveOrg()` implementing FR-013. |
| `src/services/auth.ts` | `resolvePat(org)` takes an org; env-var precedence preserved. Validation helper `validatePatAgainstAzdo(pat, org)`. |
| `src/services/context.ts` | `resolveContext(opts)` refactored to call `resolveOrg()` then `resolveProject()`. Resolution ordering moves to flag → git → config. |
| `src/services/audit-log.ts` | **NEW** — append-only JSONL writer. |
| `src/services/browser-open.ts` | **NEW** — `openUrl()` shelling out to `open`/`xdg-open`/`start`. |
| `src/commands/auth.ts` | **NEW** — `auth` + `auth status` + `auth logout` subcommands. |
| `src/commands/clear-pat.ts` | Thin wrapper + deprecation notice. |
| `src/cli.ts` (or wherever commands are registered) | Register `auth` command. |
| `src/commands/*.ts` (authenticated commands) | Call `resolvePat(ctx.org)` instead of `resolvePat()`. |
| `tests/unit/*` | New tests per module; extended `auth.test.ts`. |
| `docs/authentication.md` | Rewritten for multi-org flow. |

### Running the feature locally

```bash
npm install              # ensures @napi-rs/keyring is present (already in package.json)
npm run build            # tsup bundle
node dist/cli.js auth    # try the new command
npm test                 # full unit suite
npm run lint
```

### Running integration tests

```bash
AZDO_INTEGRATION=1 npm test -- tests/integration/auth.integration.test.ts
```

Requires either (a) a real PAT in `AZDO_TEST_PAT` env var AND a test org reachable, or (b) the integration test's sandboxed fake-keyring mode. See `tests/integration/README.md` (to be added in tasks phase).
