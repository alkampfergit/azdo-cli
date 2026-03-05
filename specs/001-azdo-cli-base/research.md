# Research: AzDO CLI Base

**Branch**: `001-azdo-cli-base` | **Date**: 2026-03-05

## R1: Commander.js for Minimal CLI

**Decision**: Use commander.js as the CLI framework.
**Rationale**: Mandated by the constitution. Commander.js provides built-in `--help` and `--version` support out of the box, which covers 100% of this feature's requirements. Calling `.version()` and `.description()` on a Program instance gives both flags for free.
**Alternatives considered**:
- yargs: More opinionated, heavier — unnecessary for two flags.
- clipanion: Type-safe but less mainstream — constitution specifies commander.js.
- Raw process.argv parsing: Too manual, no built-in help formatting.

## R2: tsup for Single-File Bundling

**Decision**: Use tsup to bundle the CLI into a single distributable file.
**Rationale**: Mandated by the constitution. tsup compiles TypeScript and bundles all code into a single output file. With `noExternal` option, all dependencies (including commander.js) can be inlined, achieving the zero-runtime-dependency goal.
**Alternatives considered**:
- esbuild directly: tsup wraps esbuild with better DX for libraries/CLIs.
- webpack: Overkill for a CLI tool.
- ncc: Viable but not specified in constitution.

## R3: Gitflow Versioning in GitHub Actions

**Decision**: Use a combination of `package.json` version (for master/stable) and git-derived pre-release suffixes (for non-master branches).
**Rationale**: The spec requires gitflow-based versioning with npm publish on all branches. For master, the version in `package.json` is used as-is and tagged `latest`. For non-master branches (develop, feature/*), a pre-release version is derived (e.g., `0.1.0-dev.{build-number}`) and published with a `next` or `dev` npm dist-tag to avoid overriding `latest`.
**Alternatives considered**:
- semantic-release: Automated but opinionated — may conflict with gitflow branch model.
- Manual version bumps only: Does not satisfy "publish on all branches" requirement.
- changesets: Designed for monorepos, overkill here.

## R4: Version Source of Truth

**Decision**: Read version from `package.json` at build time, embedded in the bundle.
**Rationale**: Commander.js `.version()` accepts a string. The simplest approach is importing from package.json or using a build-time replacement. Since tsup bundles everything, importing `package.json`'s version field directly works and ensures the CLI always outputs the exact version that was published.
**Alternatives considered**:
- Git tags at runtime: Requires git to be present — not available after npm install.
- Separate VERSION file: Extra file to maintain; package.json is the canonical source.
- Build-time define/replace: Viable but more complex than a direct import.

## R5: GitHub Actions Pipeline Design

**Decision**: Single workflow file (`ci.yml`) with conditional steps for build, publish, and release.
**Rationale**: All branches trigger build + test. The publish step runs on all branches but uses different npm tags based on branch (latest for master, dev for others). The GitHub Release step runs only on master via an `if` condition. This keeps the pipeline simple (one file) while supporting the gitflow model.
**Alternatives considered**:
- Separate workflow files per branch: More files to maintain, harder to keep in sync.
- Reusable workflow with matrix: Overcomplicated for a single-package repo.
