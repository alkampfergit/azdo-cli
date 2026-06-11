# Quickstart: Multi-Organization Support

Manual validation walkthrough (assumes auth already configured for both orgs).

## 1. Per-org configuration (US1)

```bash
# Default scope — applies everywhere (unchanged behaviour)
azdo config set fields "Custom.BusinessDescription"

# Org-scoped — applies only to org "secondary" (fully replaces the default list there)
azdo config set fields "System.Tags" --org secondary
azdo config set project azdocli --org secondary

# Inspect: every entry with its scope
azdo config list
azdo config list --json

# Copy settings as a starting point (from default or another org)
azdo config org-copy default tertiary
azdo config org-copy secondary quaternary --force

# Re-scope and delete
azdo config org-move tertiary renamed-org
azdo config org-delete quaternary
```

**Expected**: work-item commands against `secondary` use `System.Tags` only; every other org uses `Custom.BusinessDescription`; list shows scopes; move/delete never touch the default scope.

## 2. Missing custom fields degrade (US2)

```bash
# Org "secondary" has no Custom.BusinessDescription; leave the default config in place
azdo get-item 42584 --org secondary --project azdocli
```

**Expected**: work item renders; stderr shows `azdo: warning: field 'Custom.BusinessDescription' does not exist in organization 'secondary' and was skipped`; exit code 0. With `--json`, stdout stays valid JSON.

## 3. Any-name remote discovery (US3)

```bash
cd /repo/with/github-origin-and-azdo-secondary-remote
git remote -v   # origin → github.com, azdo → dev.azure.com/...
azdo get-item 1000          # no --org/--project
```

**Expected**: org/project detected from the `azdo` remote. With two distinct ADO remotes and no ADO `origin`, the command errors listing candidates instead of guessing.

## 4. No git noise outside a repo (US4)

```bash
cd /tmp && azdo get-item 1000
```

**Expected**: zero `fatal:` lines; either the work item (config-resolved context) or only the CLI's own guidance.

## 5. Credentials warning (US5)

```bash
git remote set-url origin https://user@dev.azure.com/org/proj/_git/repo
azdo get-item 1 --short          # no warning (bare username)

git remote set-url origin https://user:secret@dev.azure.com/org/proj/_git/repo
azdo get-item 1 --short          # one warning naming 'origin', no URL/secret echoed
```

## Gates

```bash
npm test && npm run lint && npm run build
```
