# 052 — Glued progress bars in `pipeline logs --no-progress` (#138)

- `--no-progress` keeps the existing `\r` collapse, then, for a line with ≥2 progress-bar tokens (`N.N [KMGT]iB / N.N [KMGT]iB [`), keeps the leading timestamp and only the last bar. Single-bar lines are untouched.
- `downloadArtifactZip` fills one preallocated buffer when Content-Length is known (no chunks + `Buffer.concat` double hold); mismatching headers fall back to concatenation.
- `docs/commands.md` documents both, including the peak-memory note. Streaming extraction is out of scope (separate issue if exit 137 recurs).
