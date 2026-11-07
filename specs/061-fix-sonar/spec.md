# Feature Specification: clear the open SonarCloud findings on develop

**Feature Branch**: `feature/061-fix-sonar`
**Status**: Approved (issue #160, owner: "implement")

## Requirements
- **FR-1**: Every open SonarCloud issue on `develop` in `src/` is fixed in code (S9382 await in loop, S7503 async without await, S3776 cognitive complexity, S6551 default `toString`). No suppression comments.
- **FR-2**: The findings in `tests/` (S7503, S5906) and in `scripts/` (S7688 in `sonar-local.sh`; S6594, S1121, S9382, S3358 in `sonar-profile-sync.mjs`) are fixed.
- **FR-3**: `.specify/` (vendored Spec Kit scripts, overwritten by `specify init`) is excluded from analysis through `.sonarcloud.properties` instead of being edited.
- **FR-4**: Behaviour is unchanged: sequential work (wizard prompts, image numbering, pagination, polling, lock retry, failed-test cap) stays sequential. Only independent credential-store reads in `auth logout --all` / `auth status` run through `Promise.all`.
- **FR-5**: `npm run sonar:local -- --all` reports only the known `S6594` extra on `auth.ts`. `docs/sonar-local.md` says what the local check covers and what it does not.

## Out of scope
Security hotspots (none open), coverage, and `S6594` on `auth.ts:93` (local-only, AGENTS.md).
