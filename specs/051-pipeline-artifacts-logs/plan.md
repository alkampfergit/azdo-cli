# Plan
- `src/services/pipeline-client.ts`: `listBuildArtifacts`, `downloadArtifactZip` (artifact `downloadUrl` + `$format=zip`), timeline `logRecords` (type + parent via `parentId`).
- `src/services/artifact-extract.ts`: in-memory unzip (`fflate`, zero deps), prefix strip, zip-slip and collision checks before writing.
- `src/commands/pipeline.ts`: two new subcommands, `--head`, `--no-progress`, listing columns.
- Dependency: `fflate` (zero-dependency, pure JS) — approved on the issue.
- Docs: `docs/commands.md`, `docs/changelogs/unreleased.md`; README untouched.
