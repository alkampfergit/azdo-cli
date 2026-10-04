# 049 — CI workflow hardening (closes #106)

Applies the 7 remaining SonarCloud findings from #104 in `.github/workflows/ci.yml`
using the reviewed patch from `specs/041-sonarcloud-cleanup/ci-workflow.patch`.

- `npm ci` → `npm ci --ignore-scripts` (S6505 ×3)
- `npx vitest …` → `npm exec --no -- vitest …` (S6505 ×2, S8543 ×2); the lock file pins vitest.

Risk: `--ignore-scripts` has not run in CI before; `@napi-rs/keyring` ships prebuilds as
optional platform packages. If the credential-store integration suite goes red, revert the
three `npm ci` hunks and keep the `npm exec` ones (clears 4 of 7).

No runtime, dependency or command-surface change; no `docs/` page affected.
