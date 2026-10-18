# Local SonarCloud check

This page explains how to run the rules of a SonarCloud quality profile on your own machine, and how to set up the
same check in another repository. You do not need a build, a token or a push.

## Why this exists

SonarCloud runs as Automatic Analysis on this repository. It does not run in `ci.yml`, and you cannot start it from your
machine. You see its result only after a push. The local check gives you most of that result before you commit.

You cannot run the real scanner locally without a token, and without turning off Automatic Analysis. This check does
not publish anything to SonarCloud. It reads the rules from the public SonarCloud API, and it runs them with ESLint.

| What | Value |
|---|---|
| Organization | `alkampfergit-github` |
| Project key | `alkampfergit_azdo-cli` |
| Quality profile | `Sonar way comprehensive` (ts) |
| Quality gate | `Sonar way` |

## Daily use

```bash
npm run sonar:local                      # files in src/ that differ from origin/develop
npm run sonar:local -- --base <ref>      # compare with another ref
npm run sonar:local -- --all             # every file in src/
npm run sonar:sync                       # download the quality profile again (needs network)
```

`sonar:local` works offline. It runs two checks and exits with `1` if one of them fails (`2` for a bad option or an
unknown base ref):

| Check | Tool | Notes |
|---|---|---|
| Code smells, bugs, vulnerabilities | ESLint with `eslint.sonar.config.js` | Rules come from `eslint.sonar.rules.json`. The default mode checks changed files only, because the quality gate looks at new code only. |
| Duplication | `jscpd` | Fails above 3% across `src/`. |

Run `npm run sonar:sync` when the quality profile changes in SonarCloud, and commit the new `eslint.sonar.rules.json`.
Read the `skipped` and `notes` sections of that file after each sync.

## How it works

### 1. Read the quality profile

SonarCloud serves the quality profile of a public project without a token:

```
GET https://sonarcloud.io/api/qualityprofiles/search?project=<project-key>&organization=<organization>
GET https://sonarcloud.io/api/qualityprofiles/export?language=ts&qualityProfile=<name>&organization=<organization>
```

Use the export. It lists every rule of the profile and the parameters that were changed. The `api/rules/search`
endpoint hides some rules: it returned 472 rules where the export returned 496.

### 2. Map each Sonar rule to an ESLint rule

`scripts/sonar-profile-sync.mjs` does the mapping:

1. **`eslint-plugin-sonarjs`.** The plugin exports rules under the name SonarJS uses (`eslintId`), so the script matches
   the `meta.ts` of the rule on that name.
2. **Wrapped ESLint rules.** SonarJS implements many rules as a wrapper around an ESLint core, `typescript-eslint` or
   `unicorn` rule. The SonarJS repository is public. For rule `Sxxxx`, the file
   `packages/analysis/src/jsts/rules/Sxxxx/meta.ts` names the wrapped rule. A `decorated` rule lists it in
   `externalRules`; an `external` rule has one `externalPlugin` constant and uses `eslintId` as the rule name.
3. **Options.** The file `config.ts` in the same folder holds the default options in `fields`. The script transpiles it
   with `typescript`, imports it, applies the parameters of the profile (keyed by `displayName`, coerced from the string
   SonarQube sends to the type of the default), and then applies each `customForConfiguration` transform. This mirrors
   `materializeRuleOptions()` in SonarJS. The script then validates the options against the installed rule. SonarJS
   handles some options in its own wrapper, so the installed rule may reject them: unknown properties are dropped, and
   a rule whose options still fail runs with its defaults. Both cases appear under `notes`.
4. **Skipped rules.** The script lists every other rule under `skipped` in `eslint.sonar.rules.json`, with the reason:
   the taint-analysis rules (`tssecurity`) and the architecture rules (`tsarchitecture`) need the full Sonar engine,
   and some rules need plugins that the repository does not use (React, Vue, Angular, accessibility, testing-library).
5. **Decorators.** Some SonarJS rules wrap an ESLint rule in a `decorator.ts` that drops most of its reports. Without it,
   the local run reports findings that SonarCloud never reports. There are two answers, both in the sync script:
   - `LOCAL_DECORATORS`: the decorator is small, so `scripts/sonar-local-plugin.js` re-creates it. `S9382`
     (`no-await-in-loop`) is the only one today: SonarJS does not report an await when the loop body has a later `return`
     or `break` (a search or a retry that stops early). Polling loops are the common case.
   - `SUPPRESSED_BY_SONARJS`: the decorator is too large to copy, so the rule is skipped. `S7727`
     (`unicorn/no-array-callback-reference`) reports only callbacks with more than one parameter, and `S7781`
     (`unicorn/prefer-string-replace-all`) reports only regexes that convert to a plain string literal. Without these
     two entries the local run reported 29 findings that SonarCloud does not report.

Rules that SonarCloud reports as Security Hotspots (`no-os-command-from-path`, `publicly-writable-directories`) are
warnings, because they need a review but do not fail the gate by themselves. No API tells the type of a rule, so the
list is `HOTSPOT_KEYS` in the sync script.

### 3. Run the rules

`eslint.sonar.config.js` loads `eslint.sonar.rules.json` and enables exactly those rules, and no others. The normal lint
stays in `eslint.config.js` and is not changed. `scripts/sonar-local.sh` selects the files, runs ESLint, and then runs
`jscpd` for duplication.

## Set it up in another repository

### Prerequisites

- A SonarCloud project that is public. For a private project, every API call needs a token
  (`Authorization: Bearer <token>`). This was not tested.
- Node.js and ESLint 9 or newer in the repository, with `typescript-eslint` configured.

### Steps

1. **Find the identifiers.** The project key and the organization key are in the SonarCloud URL. You can also read
   them from the API:

   ```bash
   curl -s 'https://sonarcloud.io/api/components/show?component=<project-key>'
   ```

   The result contains the organization key. Check `ci.yml` for a Sonar step. If there is none, the project uses
   Automatic Analysis.

2. **Copy four files** from this repository: `scripts/sonar-profile-sync.mjs`, `scripts/sonar-local-plugin.js`,
   `scripts/sonar-local.sh`, `eslint.sonar.config.js`. Make the shell script executable
   (`chmod +x scripts/sonar-local.sh`). If the repository is not an ES module (`"type": "module"`), rename the `.js`
   files to `.mjs`.

3. **Install the dev dependencies:**

   ```bash
   npm install --save-dev eslint-plugin-sonarjs eslint-plugin-unicorn jscpd typescript-eslint
   ```

4. **Add the npm scripts:**

   ```bash
   npm pkg set scripts.sonar:sync="node scripts/sonar-profile-sync.mjs"
   npm pkg set scripts.sonar:local="bash scripts/sonar-local.sh"
   ```

5. **Edit the values that belong to the repository:**

   | File | Value | Change it to |
   |---|---|---|
   | `scripts/sonar-profile-sync.mjs` | `ORGANIZATION`, `PROJECT_KEY` | the identifiers from step 1 |
   | `scripts/sonar-profile-sync.mjs` | `LANGUAGE` | `"js"` for a JavaScript repository |
   | `scripts/sonar-local.sh` | `BASE`, `PATHS`, `CPD_PATHS` | the base branch and the source folders |
   | `eslint.sonar.config.js` | `files`, `ignores`, `project` | the source folders and the `tsconfig.json` path |

6. **Generate the rules and run the check:**

   ```bash
   npm run sonar:sync
   npm run sonar:local -- --all
   ```

   Commit `eslint.sonar.rules.json`.

7. **Calibrate against the real result.** This step is the most important. Do not trust the first run.

   ```bash
   # Real open issues of the project, grouped by rule
   curl -s 'https://sonarcloud.io/api/issues/search?componentKeys=<project-key>&resolved=false&ps=1&facets=rules'
   # Real duplication
   curl -s 'https://sonarcloud.io/api/measures/component?component=<project-key>&metricKeys=duplicated_lines_density,ncloc,duplicated_lines,duplicated_blocks'
   # Which folders SonarCloud counts, and where it finds duplication
   curl -s 'https://sonarcloud.io/api/measures/component_tree?component=<project-key>&metricKeys=ncloc,duplicated_lines&qualifiers=FIL,UTS&ps=500'
   curl -s 'https://sonarcloud.io/api/settings/values?component=<project-key>' | grep -i exclusions
   ```

   Compare these results with the output of `npm run sonar:local -- --all`, rule by rule, and file and line by file
   and line (`sonarKeys` in `eslint.sonar.rules.json` maps each ESLint rule to its Sonar number). Then adjust:

   - A rule that the local run reports and SonarCloud never reports: read the `decorator.ts` in the SonarJS folder of
     the rule, and read its `config.ts` options. Then add it to `LOCAL_DECORATORS` or `SUPPRESSED_BY_SONARJS`.
   - Folders without any real finding, for example `tests/`: remove them from the rule scope.
   - Duplication: raise or lower `MIN_TOKENS` in `scripts/sonar-local.sh` until `jscpd` finds the same clones as
     SonarCloud. Also check `sonar.cpd.exclusions`.

## Calibration of this repository

These are the results on `develop` when this check was written (SonarCloud analysis of 2026-10-15).

| Rule | SonarCloud (src/) | Local | Notes |
|---|---|---|---|
| `S9382` no await in loop | 14 | 14 | same lines, thanks to `sonar-local/no-await-in-loop` |
| `S7503` async without await | 4 | 4 | same lines |
| `S3776` cognitive complexity | 1 | 1 | same line |
| `S6551` default `toString` | 1 | 1 | same line |
| `S6594` `RegExp.exec` | 0 | 1 | extra, see below |

- **Duplication.** SonarCloud finds 4 blocks and 80 duplicated lines, all in `src/`. At 80 tokens `jscpd` finds 4 clones
  and 74 lines. The SonarCloud density is 0.2% because it divides by the lines of all folders (about 31 600), and
  `tests/` counts in the divisor, but `sonar.cpd.exclusions` is `**/tests/**`, so `tests/` never has duplicated lines.
  The local percentage divides by `src/` only (0.46%), so it is stricter. The limit of 3% is far away in both.
- **Tests.** SonarCloud does report rule issues in `tests/` (open today: `S7503` x5 and `S5906` x1), but the local rules
  cover `src/` only. Linting `tests/` with the same rules gave 228 findings, mostly `require-await` on async mocks that
  SonarCloud does not flag, so it was left out until the decorators for those rules are re-created. A pull request can
  still get a `tests/` finding that `sonar:local` does not show.

## Known limits

The local check is an approximation. On `develop` of this repository it finds every rule issue that SonarCloud reports
in `src/`, at the same lines, plus one extra finding.

- **Extra findings.** `S6594` (`sonarjs/prefer-regexp-exec`) reports `auth.ts:93`; SonarCloud does not. The most likely
  cause is typing: Automatic Analysis runs without `node_modules`, so the type of values that come from Node APIs is
  unknown there, and a type-aware rule stays silent. Check such a finding before you change the code. Do not hide it
  with a suppression comment.
- **Missing rules.** The skipped rules are never checked. A pass does not guarantee a green quality gate.
- **`NOSONAR`.** SonarCloud honours `// NOSONAR` comments. The local check does not. This repository has none in `src/`.
- **Not computed.** The quality gate also uses the review of Security Hotspots and the maintainability ratings. The local
  check does not compute them.
- **Duplication.** `jscpd` counts tokens differently from Sonar. At 100 tokens it reported 2 clones where SonarCloud
  reports 4 blocks; at 150 tokens it reported none. Calibrate `MIN_TOKENS` for every repository.
- **SonarJS layout.** The sync script reads the `master` branch of the SonarJS repository. If SonarJS moves its rule
  folders, a rule gets no `meta.ts` and the script skips it with the reason `no meta.ts in SonarJS`, and it prints a
  warning. Compare the number of enabled rules after each sync.
- **Plugin versions.** The installed `eslint-plugin-sonarjs`, `typescript-eslint` and `unicorn` can lag behind the SonarJS
  version that SonarCloud runs. A rule that is missing in the installed plugin is skipped, with the reason.

To read the real result of a pull request, use the `sonarcloud-pr-fix` skill.
