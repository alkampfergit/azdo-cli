# Tasks: 044-deps-security

**Gate**: `npm test && npm run lint` must pass before the PR is marked ready.

- [X] **T001** `npm audit fix` (FR-001).
- [X] **T002** In-range bumps + `package.json` floors (FR-002).
- [X] **T003** `npm audit` → 0; `npm outdated` → majors only.
- [X] **T004** `npm test && npm run lint` (FR-003).
- [X] **T005** `docs/changelogs/unreleased.md` entry.
