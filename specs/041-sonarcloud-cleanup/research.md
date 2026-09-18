# Research: SonarCloud clean sweep

## The authoritative list

```
curl -s "https://sonarcloud.io/api/issues/search?componentKeys=alkampfergit_azdo-cli\
&branch=develop&issueStatuses=OPEN,CONFIRMED&ps=200"
```

→ `total: 35`, `effortTotal: 646` (minutes). Grouped by file:

| File | Count | Rules |
|---|---|---|
| `.devcontainer/postcreate.sh` | 7 | S6506 ×5, S6505, S8541 |
| `.github/workflows/ci.yml` | 7 | S6505 ×3 (`npm ci`), S6505 ×2 (`npx`), S8543 ×2 |
| `scripts/compute-version.sh` | 5 | S7688 ×5 |
| `src/commands/pr.ts` | 2 | S3776 (46), S7754 |
| `src/services/auth.ts` | 2 | S3776 (17), S7763 |
| `src/types/relations.ts` | 2 | S6571 ×2 |
| `.specify/scripts/bash/update-agent-context.sh` | 2 | S1192, S1481 |
| `src/commands/auth.ts` | 1 | S3776 (18) |
| `src/commands/list-fields.ts` | 1 | S6551 |
| `src/commands/relations.ts` | 1 | S6606 |
| `tests/unit/git-remote.test.ts` | 1 | S5976 |
| `tests/unit/auth.test.ts` | 1 | S5906 |
| `tests/unit/trace-writer.test.ts` | 1 | S2699 |
| `tests/integration/md-generic-types.test.ts` | 1 | S5976 |
| `tests/integration/auth.integration.test.ts` | 1 | S2187 |

No bugs. Nothing in the list is a behaviour defect; all 35 are hygiene.

## Decisions

### D-1: `npm ci --ignore-scripts` in CI — take it, with a revert trigger

`@napi-rs/keyring` is native, so the reflex worry is that skipping install
scripts leaves it unbuilt. It does not: napi-rs ships prebuilt binaries as
**optional platform packages** (`@napi-rs/keyring-linux-x64-gnu` and friends)
resolved by `optionalDependencies`, not by a `postinstall` build. `npm ci`
still installs those packages with `--ignore-scripts`.

The verification is empirical, not argumentative: the branch's own CI run has
to be green, including the keyring-backed `credential-store integration (real
OS keyring)` suite. **If that suite goes red, the `--ignore-scripts` hunk is
reverted** and the three S6505 findings are left to the owner to mark rather
than fought. Rationale: a green pipeline outranks three hygiene findings.

### D-2: `npx vitest` → the installed binary

S6505 (`npx` can install on demand) and S8543 (unpinned version) are the same
underlying fact: `npx vitest` resolves to whatever `vitest` it can find,
including the registry. `vitest` is already a devDependency pinned by
`package-lock.json`, so `npm exec --no -- vitest ...` uses exactly that and
fails loudly rather than downloading. This satisfies both rules with one edit
per call site and no version string duplicated into the workflow.

### D-3: `.specify/` — fix in place

Two trivial findings (a repeated string literal, an unused local). Fixing them
costs minutes. Excluding the vendored tree from analysis would be more durable
but is a SonarCloud project-settings change, not a repository change, and is
out of scope here. Noted as a follow-up: the next spec-kit upgrade will
reintroduce both.

### D-4: `S2187` on `auth.integration.test.ts` — make the test visible, do not
mark it *Won't fix*

The file has exactly one test, declared as `itIntegration(...)`, an alias
resolved at module load (`process.env.AZDO_INTEGRATION === '1' ? it : it.skip`).
Sonar's detector looks for a literal `it` / `test` call and sees none, hence
"add some tests to this file or delete it".

Fix: the helper becomes a plain boolean (`INTEGRATION_ENABLED`) and the file
declares its case with a literal `it(...)` inside
`describe.skipIf(!INTEGRATION_ENABLED)(...)` — the same idiom
`md-generic-types.test.ts` already uses with `SKIP_AZDO`. Behaviour is
identical (no real keyring is touched unless `AZDO_INTEGRATION=1`), but the
declaration is now something vitest's own filtering, an editor, and Sonar can
all see. FR-001 rules out closing this in the SonarCloud UI.

### D-5: Scope — one PR

The owner filed one issue ("fix all") and said go. Splitting infra from source
would produce two PRs for one issue and two SonarCloud analyses to chase. The
three complexity refactors are kept as their own commits inside the PR so they
can be reviewed in isolation.

### D-6: `S6571` on `'workItemLink' | 'resourceLink' | string`

The union collapses to `string`, so the literals document nothing to the
compiler — they only mislead a reader into thinking the type is checked. The
`(string & {})` trick would preserve editor completion but is an idiom the
repo does not use anywhere and reads as a workaround. Resolution: the field
becomes `string` with the known values named in a comment, which is what the
type actually means.

### D-7: `S5976` parameterisation must not create a second S5976

`git-remote.test.ts` has two families of near-identical tests in its first
`describe` — "parses X → `{org, project}`" and "returns null for Y". Sonar
flagged the first (6 cases). Folding only that family risks the second family
crossing the threshold on the next analysis. Both are parameterised, each into
its own `it.each` table with the case label as the test name.

### D-8: `uv tool install --no-build` forces a source change for spec-kit

S8541 wants `--no-build` on `uv tool install specify-cli --from
git+https://github.com/github/spec-kit.git`. That combination does not work —
verified, not assumed:

```
$ uv pip install --no-build "specify-cli @ git+https://github.com/github/spec-kit.git"
error: Building source distributions is disabled, but attempted to build `specify-cli`
```

A git URL has no wheel, so `--no-build` necessarily fails. The rule can only be
satisfied by installing something that ships a wheel. `specify-cli` **is** on
PyPI (1.0.8, `specify_cli-1.0.8-py3-none-any.whl`), and it is the same project:
the devcontainer currently ends up on `1.0.8.dev0` built from `main`, i.e. the
pre-release of that very version.

Resolution: the devcontainer installs `uv tool install specify-cli --no-build`
from PyPI. This is a **real change to the dev environment**, not a no-op
lint fix, and is called out in the PR body: spec-kit stops tracking `main` and
follows PyPI releases instead. That is strictly more reproducible, but it is
the owner's call to keep — if they want `main`, the honest outcome is to revert
this hunk and leave S8541 open rather than pretend it can be fixed in place.

### D-9: the `pr comments` action needed one more extraction than planned

With the four helpers from plan R-1, the action still measured about 15 —
exactly at the limit, which is not a margin. The thread filter/shape pipeline
(three chained callbacks, three logical sequences) moved out into
`shapeCommentThreads` as well, taking the action to roughly 12.
