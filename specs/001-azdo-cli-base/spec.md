# Feature Specification: AzDO CLI Base

**Feature Branch**: `001-azdo-cli-base`
**Created**: 2026-03-05
**Status**: Draft
**Input**: User description: "create an azdo commandline with only --version and --help command support, but with a github action to compile in a single package that will be distributed by npm"

## Clarifications

### Session 2026-03-05

- Q: What should the npm package name be? → A: `azdo-cli` (unscoped, disambiguated name)
- Q: What triggers the automated build/publish pipeline? → A: Build always runs on all branches using gitflow versioning; publish to npm on all builds; create GitHub Release only on master
- Q: What should the initial version number be? → A: `0.1.0` (pre-stable, signaling early development)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install CLI Globally (Priority: P1)

A developer wants to install the AzDO CLI tool on their machine so they can use it from any terminal session. They install the package globally from the npm registry and immediately have access to the `azdo` command.

**Why this priority**: Without installation, no other functionality is accessible. This is the foundation for all future CLI capabilities.

**Independent Test**: Can be fully tested by running `npm install -g azdo-cli` and verifying the `azdo` command is available in the system PATH, delivering immediate access to the tool.

**Acceptance Scenarios**:

1. **Given** the package `azdo-cli` is published to the npm registry, **When** a user runs `npm install -g azdo-cli`, **Then** the `azdo` command becomes available in their terminal.
2. **Given** the package is installed globally, **When** a user opens a new terminal session, **Then** the `azdo` command is still accessible.
3. **Given** the user has a previous version installed, **When** they run the global install command again, **Then** the tool is updated to the latest version without conflicts.

---

### User Story 2 - Check Version (Priority: P1)

A developer wants to verify which version of the AzDO CLI they have installed to ensure they are running the expected release.

**Why this priority**: Version checking is essential for troubleshooting, support, and ensuring compatibility. It is one of only two supported commands in this initial release.

**Independent Test**: Can be fully tested by running `azdo --version` and verifying the output matches the published package version.

**Acceptance Scenarios**:

1. **Given** the CLI is installed, **When** the user runs `azdo --version`, **Then** the current version number is displayed in a standard format (e.g., "0.1.0").
2. **Given** the CLI is installed, **When** the user runs `azdo -v`, **Then** the same version output is displayed (short flag alias).
3. **Given** the CLI is installed, **When** the version is displayed, **Then** it matches the version defined in the published package metadata.

---

### User Story 3 - View Help Information (Priority: P1)

A developer wants to see what commands and options are available so they can understand how to use the tool.

**Why this priority**: Help output is the primary discoverability mechanism for CLI tools and one of only two supported commands in this initial release.

**Independent Test**: Can be fully tested by running `azdo --help` and verifying comprehensive usage information is displayed.

**Acceptance Scenarios**:

1. **Given** the CLI is installed, **When** the user runs `azdo --help`, **Then** usage information is displayed including the tool name, description, and available options.
2. **Given** the CLI is installed, **When** the user runs `azdo -h`, **Then** the same help output is displayed (short flag alias).
3. **Given** the CLI is installed, **When** the user runs `azdo` with no arguments, **Then** the help output is displayed by default.

---

### User Story 4 - Automated Build and Publish (Priority: P2)

A maintainer wants the CLI to be automatically compiled into a single distributable package and published to the npm registry on every build, following gitflow versioning. A formal GitHub Release is created only when changes are merged to the master branch.

**Why this priority**: Automated distribution ensures reliable, repeatable releases and reduces human error in the publish process. It is secondary to the core CLI functionality but essential for sustainable delivery.

**Independent Test**: Can be fully tested by triggering the automated build pipeline on any branch and verifying the resulting package is published to the npm registry, and that a GitHub Release is created only for master branch builds.

**Acceptance Scenarios**:

1. **Given** code is pushed to any branch, **When** the automated pipeline runs, **Then** the CLI is compiled into a single distributable package.
2. **Given** the build completes on any branch, **When** the publish step runs, **Then** the package is published to the npm registry with a version derived from gitflow conventions.
3. **Given** a build completes on the master branch, **When** the release step runs, **Then** a GitHub Release is created with the corresponding version tag.
4. **Given** a build completes on a non-master branch, **When** the pipeline finishes, **Then** no GitHub Release is created.
5. **Given** the pipeline fails, **When** the maintainer reviews the build logs, **Then** clear error information is available to diagnose the issue.

---

### Edge Cases

- What happens when the user provides an unrecognized command or flag (e.g., `azdo --foo`)? The CLI should display an error message indicating the unknown option and show the help output.
- What happens when the user runs `azdo` in an environment without proper permissions? Standard OS permission errors should be surfaced.
- What happens if the package is installed locally (not globally)? The CLI should still function when invoked via the local package runner (e.g., `npx azdo-cli`).
- What happens when the automated build encounters a version conflict on the registry? The pipeline should fail with a clear error rather than overwriting an existing version.
- What happens when a non-master branch publishes a pre-release version? The package should be tagged appropriately (e.g., `next`, `dev`) so it does not become the default `latest` on npm.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tool MUST provide a command-line executable named `azdo` that users can invoke from their terminal.
- **FR-002**: The tool MUST display the current version number when invoked with `--version` or `-v`.
- **FR-003**: The tool MUST display help information (tool name, description, available options) when invoked with `--help` or `-h`.
- **FR-004**: The tool MUST display help information when invoked with no arguments.
- **FR-005**: The tool MUST display a clear error message and the help output when invoked with an unrecognized command or flag.
- **FR-006**: The version output MUST match the version defined in the package metadata.
- **FR-007**: The tool MUST be installable globally via `npm install -g azdo-cli` and available in the user's PATH after installation.
- **FR-008**: The tool MUST be compiled into a single distributable package with no runtime dependencies required after installation.
- **FR-009**: The automated pipeline MUST build and compile the package on every push to any branch.
- **FR-010**: The automated pipeline MUST publish the compiled package to the npm registry on every successful build, using gitflow-derived version numbering.
- **FR-011**: The automated pipeline MUST create a GitHub Release only when building from the master branch.
- **FR-012**: Non-master branch builds MUST publish to npm with a pre-release tag (not `latest`) to avoid overriding stable releases.
- **FR-013**: The tool MUST exit with a zero exit code for successful operations (`--version`, `--help`) and a non-zero exit code for errors (unrecognized flags).

### Key Entities

- **CLI Executable**: The `azdo` command-line tool that users invoke directly. Supports `--version` and `--help` flags. Published as the `azdo-cli` npm package.
- **Distributable Package**: The single bundled artifact published to the npm registry as `azdo-cli`, containing the compiled CLI with no external runtime dependencies.
- **Automated Pipeline**: The build, publish, and release process that compiles the CLI on every push, publishes to npm on all branches, and creates a GitHub Release only on master.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can install the tool globally via `npm install -g azdo-cli` and run `azdo --version` within 60 seconds of starting the install process.
- **SC-002**: The `--version` flag outputs the correct version 100% of the time, matching the published package version.
- **SC-003**: The `--help` flag displays complete usage information including all available options.
- **SC-004**: The installed package contains a single bundled file with zero runtime dependencies to download.
- **SC-005**: The automated pipeline successfully builds, publishes, and (on master) creates a GitHub Release without manual intervention.
- **SC-006**: 100% of unrecognized inputs produce a user-friendly error message and the help output.
- **SC-007**: Non-master branch builds never override the `latest` npm tag.

## Assumptions

- The npm package name is `azdo-cli`.
- The CLI command name is `azdo`.
- Standard semantic versioning (semver) is used, with gitflow conventions for pre-release versioning on non-master branches.
- The initial version is `0.1.0`.
- The project follows gitflow branching (master, develop, feature branches).
- The tool targets all major operating systems (Windows, macOS, Linux) where npm is supported.
- No authentication or configuration is required for the initial `--version` and `--help` commands.
