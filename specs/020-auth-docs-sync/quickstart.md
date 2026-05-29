# Quickstart: Verifying the auth docs match the CLI

This feature is documentation-only; "validation" means confirming the docs match the actual CLI and that links resolve. Steps an implementer/reviewer runs:

## 1. Build the current CLI (source of truth)

```bash
npm run build
node dist/index.js auth --help
node dist/index.js auth login --help
node dist/index.js auth status --help
node dist/index.js auth logout --help
node dist/index.js clear-pat --help
```

Compare the output against [contracts/auth-command-surface.md](./contracts/auth-command-surface.md). Remember: `auth login --help` lists only `--org`; the OAuth flags are inherited from the parent `auth` and still valid on `login`.

## 2. Confirm the entry-point docs now show login/OAuth

```bash
grep -n "auth login" README.md docs/commands.md
```

Expected: `README.md` mentions `azdo auth login` (OAuth default) and `docs/commands.md` has an `azdo auth login` row.

## 3. Find any remaining stale references

```bash
grep -rniE 'azdo auth|clear-pat|AZDO_PAT|personal access token' README.md docs/
```

Every hit must describe a command/flag that exists in the contract; no doc may claim login is unsupported or describe `azdo auth` as PAT-only without acknowledging OAuth.

## 4. Check internal links resolve

For each Markdown link target referenced in the touched docs, confirm the file/anchor exists (e.g. `docs/authentication.md`, `docs/oauth-app-registration.md`, `docs/linux-credential-store.md`).

## 5. Confirm no source changed

```bash
git diff --name-only develop... | grep -vE '^(README\.md|docs/|specs/)' || echo "OK: docs/specs only"
```

Expected: only `README.md`, files under `docs/`, and the spec bundle under `specs/` are touched (SC-005).

## 6. Repo checks must not regress

```bash
npm run lint && npm test && npm run build
```

(These do not cover Markdown but must remain green.)
