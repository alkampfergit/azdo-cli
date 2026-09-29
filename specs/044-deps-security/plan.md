# Plan: 044-deps-security

1. `npm audit fix` — lifts `vitest`/`@vitest/mocker` to 4.1.11 and `@humanfs/node` to 0.16.8 in the lockfile.
2. Raise the `package.json` floors to the installed in-range versions so a fresh
   install cannot resolve back to a vulnerable `vitest` (FR-002).
3. Verify: `npm audit` (0), `npm outdated` (only majors remain), `npm test && npm run lint`.

No code, docs page or README change: no command surface moves. One entry in
`docs/changelogs/unreleased.md` under *Internal*.

Note: `npm run format` reports style drift in 58 files on `develop` already
(identical count with prettier 3.8.1); not introduced here, left alone.
