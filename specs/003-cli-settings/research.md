# Research: CLI Settings

## R1: Config File Location

**Decision**: Use `~/.azdo/config.json` (home directory dot-folder pattern)

**Rationale**:
- Matches the existing `azdo-cli` service name used in credential-store.ts
- Simple, cross-platform: `os.homedir()` + `/.azdo/config.json`
- Popular CLIs use this pattern: `~/.npmrc`, `~/.gitconfig`, `gh` uses `~/.config/gh/`
- XDG_CONFIG_HOME compliance is nice but adds complexity for marginal benefit; the simpler `~/.azdo/` pattern is sufficient for this tool's scope

**Alternatives considered**:
- `~/.config/azdo/config.json` (XDG-compliant) - more complex path resolution, less intuitive on Windows
- `~/.azdorc` (single file) - less extensible if more config files are needed later
- Environment variables only - constitution default, but user scenarios explicitly demand persistent file

## R2: Config File Format

**Decision**: JSON

**Rationale**:
- Zero additional dependencies - `JSON.parse()` and `JSON.stringify()` are built-in
- TypeScript has native type support for JSON objects
- Human-readable and editable
- Matches the project's existing patterns (package.json, tsconfig.json)

**Alternatives considered**:
- TOML - requires a parsing library (extra dependency violates constitution principle IV)
- YAML - requires a parsing library
- INI - limited type support, no arrays for fields list

## R3: Config File Read/Write Strategy

**Decision**: Use `node:fs` with `JSON.parse`/`JSON.stringify`, `node:path` for path construction, and `fs.mkdirSync` with `recursive: true` for directory creation

**Rationale**:
- Zero runtime dependencies
- `fs.readFileSync`/`fs.writeFileSync` are appropriate for small config files (sync is simpler and config I/O is not performance-critical)
- `fs.mkdirSync({ recursive: true })` handles directory creation
- `JSON.stringify(data, null, 2)` produces human-readable output

**Alternatives considered**:
- `conf` or `configstore` npm packages - adds runtime dependency, violates constitution principle IV
- Async file I/O - unnecessary complexity for tiny config files

## R4: Azure DevOps API - Requesting Additional Fields

**Decision**: Use the `$expand=all` parameter or specify `fields` query parameter in the work item API

**Rationale**:
- The Azure DevOps REST API `GET _apis/wit/workitems/{id}` supports a `fields` query parameter to request specific fields
- Currently the API call doesn't specify `fields`, so it returns all default fields
- To get additional/custom fields, we can either:
  1. Add requested field names to the `fields` query parameter (most efficient)
  2. Use `$expand=all` to get everything (simpler but heavier)
- Option 1 is preferred: append additional field names to the API `fields` parameter
- The response returns fields as `Record<string, unknown>`, so additional fields are accessed by their reference name

**Alternatives considered**:
- Separate API call for field definitions - unnecessary overhead
- `$expand=all` - returns more data than needed

## R5: Context Resolution Order

**Decision**: Explicit flags > git remote > saved defaults

**Rationale**:
- Explicit flags are the most intentional user action, so they win
- Git remote provides context-aware defaults (different projects in different repos), so it takes precedence over global defaults
- Saved defaults are the fallback when neither flags nor git remote are available
- This preserves the existing behavior of the `get-item` command (flags > git remote) and adds saved defaults as a new fallback layer

**Alternatives considered**:
- Flags > saved defaults > git remote - would break context-aware behavior for multi-project users
- Flags > git remote > env vars > saved defaults - env vars for org/project are not currently supported and add unnecessary complexity

## R6: Settings Validation

**Decision**: Validate keys against a fixed allowlist; values are validated per-key

**Rationale**:
- Only 3 keys: `org`, `project`, `fields`
- `org` and `project` are non-empty strings
- `fields` is a comma-separated list of field reference names
- Rejecting unknown keys prevents typos from silently failing
- Simple validation, no schema library needed

**Alternatives considered**:
- Accept any key (freeform) - too error-prone, typos would go unnoticed
- JSON schema validation - over-engineering for 3 keys
