# 057 — Fix source-map-js CVE-2026-93749 (issue #151)

## Finding
Trivy gate (security.yml run 37939166281, `develop` and `master`): `package-lock.json`,
`source-map-js` 1.2.1, CVE-2026-93749, HIGH — denial of service via malformed indexed
source maps. Fixed in 1.2.2. The published-package job was clean.

## Impact analysis — does it affect azdo-cli?
**No.** Not exploitable in the shipped product.
- Dependency path: `tsup` (devDependency) → `postcss@8.5.28` → `source-map-js`. It is
  not in `dependencies`, so `npm i -g azdo-cli` never installs it (the package scan agrees).
- `dist/` does not bundle it (no reference to `source-map-js`).
- The flaw needs a malicious *indexed source map* parsed by the library. At build time
  tsup/postcss only parse maps generated from this repository's own sources; the CLI never
  parses source maps at runtime.
- Residual risk: build/CI tooling only, and only if an attacker could feed a crafted map
  into the build. Still fixed, because the gate fails on any HIGH.

## Fix
Lockfile bump of the transitive dependency to 1.2.2 (`npm update source-map-js`).
No `package.json` change, no source change, no new dependencies, no `.trivyignore` entry.

## Verification
`npm ls source-map-js` shows 1.2.2; `npm test && npm run lint` pass; re-run
`gh workflow run security.yml` after merge to confirm the gate is green.
