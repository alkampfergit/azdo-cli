# Spec 051 — pipeline artifacts, log filtering, log-to-step mapping (#135)

## P1 — Artifacts
- `azdo pipeline artifacts <run_id> [--json]` lists name, type, size (`GET build/builds/{id}/artifacts`).
- `azdo pipeline artifact-download <run_id> [name] [--path <dir>] [--all] [--force] [--progress]`:
  extracts straight into the destination (default `./<name>`; `--all` → `<dir>/<name>` each).
  The zip is held in memory and never written to disk, so none is left behind on success or failure.
- Name and `--all` are mutually exclusive; neither → exit 1 listing available artifacts; unknown name → same.
- No overwrite without `--force`; zip-slip entries abort before any write.
- Silent by default: stdout is the destination path(s); `--progress` adds byte lines on stderr.

## P2 — Log filtering
- `pipeline logs --head <n>` (exclusive with `--tail`), `--no-progress` (collapse `\r` redraws, opt-in only).

## P3 — Listing mapping
- Each log shows record `type` and `parent`; `--json` carries both; `--step` ambiguity error prints them.

## Out of scope
- §4 `pipeline wait` exit code: existing behaviour (failed → 1, canceled → 2, timeout → 124) is already covered by tests; awaiting a repro.
- `--step` / `--tail` / `--grep` already exist.
