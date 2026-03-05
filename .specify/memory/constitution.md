<!--
  Sync Impact Report
  ==================
  Version change: N/A → 1.0.0 (initial ratification)
  Modified principles: N/A (initial creation)
  Added sections:
    - Core Principles (5 principles)
    - Technology Stack
    - Development Workflow
    - Governance
  Removed sections: N/A
  Templates requiring updates:
    - .specify/templates/plan-template.md ✅ no changes needed (generic)
    - .specify/templates/spec-template.md ✅ no changes needed (generic)
    - .specify/templates/tasks-template.md ✅ no changes needed (generic)
  Follow-up TODOs: None
-->

# azdo-cli Constitution

## Core Principles

### I. CLI-First Design

- Every feature MUST be exposed as a commander.js command or
  subcommand with clear argument and option definitions.
- Commands MUST follow POSIX conventions: arguments via stdin/args,
  output to stdout, errors to stderr.
- Commands MUST support both human-readable and JSON output formats
  via a `--json` flag where applicable.
- Exit codes MUST be meaningful: 0 for success, non-zero for errors.

### II. TypeScript Strictness

- The project MUST use TypeScript with `strict: true` in
  `tsconfig.json`; no exceptions.
- Use of `any` is forbidden. Use `unknown` with type guards when
  the type is genuinely uncertain.
- All public APIs (exported functions, command options, return types)
  MUST have explicit type annotations.
- Prefer interfaces for object shapes and type aliases for unions
  and utility types.

### III. Single Responsibility Commands

- Each command MUST do one thing and do it well, following Unix
  philosophy.
- Commands MUST NOT combine unrelated operations; compose via
  piping or subcommands instead.
- Shared logic MUST be extracted into service modules under `src/`
  rather than duplicated across commands.

### IV. npm Distribution

- The package MUST be publishable to npm as a single executable
  CLI tool.
- tsup MUST be used as the sole bundler; no additional build tools
  unless strictly necessary.
- The `bin` field in `package.json` MUST point to the bundled
  entry point.
- Dependencies included at runtime MUST be kept minimal; prefer
  bundling over runtime dependency installation.
- The package MUST include a proper `files` whitelist in
  `package.json` to avoid publishing unnecessary artifacts.

### V. Simplicity

- Start with the simplest implementation that satisfies the
  requirement. YAGNI applies at all times.
- No abstractions, wrappers, or indirection layers unless they
  solve a concrete, present problem.
- Configuration MUST use environment variables or CLI flags; no
  configuration file formats unless user scenarios demand it.
- Prefer flat module structure over deeply nested directories.

## Technology Stack

- **Language**: TypeScript 5.x (strict mode)
- **Runtime**: Node.js (LTS)
- **CLI Framework**: commander.js
- **Bundler**: tsup
- **Package Manager**: npm
- **Distribution**: npm registry
- **Testing**: vitest (preferred) or Node.js built-in test runner
- **Linting**: ESLint with TypeScript parser
- **Formatting**: Prettier

## Development Workflow

- All code changes MUST pass linting and type-checking before
  commit.
- The `tsup` build MUST succeed with zero errors and zero
  warnings before any release.
- Semantic versioning (MAJOR.MINOR.PATCH) MUST be used for all
  published versions.
- The `master` branch MUST always be in a publishable state.
- Feature work MUST happen on feature branches and merge via
  pull request.

## Governance

- This constitution supersedes conflicting practices found
  elsewhere in the repository.
- Amendments MUST be documented with a version bump, rationale,
  and updated date.
- Version bumps follow semantic versioning:
  - MAJOR: Principle removal or backward-incompatible redefinition.
  - MINOR: New principle or materially expanded guidance.
  - PATCH: Clarifications, wording, or typo fixes.
- All pull requests SHOULD verify compliance with these principles
  during review.

**Version**: 1.0.0 | **Ratified**: 2026-03-04 | **Last Amended**: 2026-03-04
