# Data Model: AzDO CLI Base

**Branch**: `001-azdo-cli-base` | **Date**: 2026-03-05

## Overview

This feature has no persistent data model. The CLI is stateless — it reads version metadata from the bundled package and outputs text to stdout/stderr. No entities require storage, state transitions, or relationships.

## Entities

### PackageMetadata (read-only, embedded at build time)

| Field   | Type   | Source       | Description                        |
|---------|--------|--------------|------------------------------------|
| name    | string | package.json | Package name (`azdo-cli`)          |
| version | string | package.json | Semver version (e.g., `0.1.0`)     |
| description | string | package.json | Tool description for help output |

**Notes**: This is not a runtime data entity — it is embedded in the bundle at build time by tsup. No database, file I/O, or network calls are involved.

## State Transitions

None. The CLI is a pure function of its input arguments:

- `--version` / `-v` → output version string → exit 0
- `--help` / `-h` / no args → output help text → exit 0
- unknown flag → output error + help → exit 1
