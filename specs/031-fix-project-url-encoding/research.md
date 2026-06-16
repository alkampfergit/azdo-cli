# Research: Fix URL Percent-Encoding for ADO Project Names with Spaces

**Date**: 2026-06-16 | **Branch**: `031-fix-project-url-encoding`

## R1 — Root Cause

**Decision**: The double-encoding originates in `src/services/git-remote.ts`. Both `matchAzdoRemote()` (line 78) and `parseAzdoRemote()` (line 150) capture the project name segment from the URL regex and store it **without calling `decodeURIComponent()`**.

**Rationale**: The git `.git/config` file stores the remote URL verbatim, including any percent-encoding introduced when the repo was cloned (e.g., `Course%20Examples%20Builds`). The regex captures this raw segment as `match[2]`. Downstream code that constructs ADO REST API URLs then re-encodes the `%` character to `%25`, turning `%20` into `%2520` — the double-encoding observed in the issue.

**Evidence**:
- `git-remote.ts:78` — `const project = match[2];` (no decoding)
- `git-remote.ts:150` — `const project = match[2];` (no decoding)
- Confirmed by existing test `tests/unit/git-remote.test.ts:38-41` which explicitly asserts `project: 'my%20project'` (the currently-buggy raw form).

**Alternatives considered**:
- Fix at the URL-construction layer (in `azdo-client.ts`): rejected — would require touching every API call site and could cause regressions.
- Decode org name (`match[1]`) as well: org names never contain spaces in practice; deferred as a follow-up if ever needed.

---

## R2 — Fix Strategy

**Decision**: Apply `decodeURIComponent(match[2])` at both extraction sites in `git-remote.ts`. Wrap in a safe helper to handle malformed `%XX` sequences (`decodeURIComponent` throws on `%GG`-style sequences).

**Rationale**: The fix is minimal (two one-line changes + a two-line helper) and contained entirely in the URL parsing layer. All downstream consumers receive a plain-text project name (`Course Examples Builds`) and can construct API URLs normally without any re-encoding risk.

**Safe decode helper** (to be added in `git-remote.ts`):
```typescript
function decodePctSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment; // malformed encoding: return raw segment unchanged
  }
}
```

Applied as: `const project = decodePctSegment(match[2]);` in both `matchAzdoRemote` and `parseAzdoRemote`.

---

## R3 — Test Impact

**Decision**: Update the one existing test that asserts the buggy behavior; add new targeted tests.

**Tests to update**:
- `git-remote.test.ts:38-41` — Change expected `project` from `'my%20project'` to `'my project'` (decoded).

**New tests to add** in `git-remote.test.ts`:
1. `parseAzdoRemote` with `Course%20Examples%20Builds` → `{ org: 'gianmariaricci', project: 'Course Examples Builds' }`
2. `parseAzdoRemote` with multi-space project `My%20Awesome%20Project` → decoded
3. `parseAzdoRemote` with userinfo prefix + encoded project → decoded correctly
4. `parseAllAzdoRemotes` / `matchAzdoRemote` path: `gitConfigToRemoteLines` + `parseAllAzdoRemotes` for config with encoded project name → decoded project in `RemoteCandidate`
5. Malformed encoding `%GG` → returned as-is (no throw)

**FROZEN_BASELINE**: No change required — the five canonical URLs in `git-remote.cases.ts` contain no percent-encoded segments.

---

## R4 — README Update

**Decision**: No README change needed. The fix is transparent to the user — it restores correct behaviour. No new flags, commands, or configuration keys are introduced.

**Rationale**: Constitution §Development Workflow requires README review before merge. The fix corrects a bug silently; the README section on auto-detection from git remote already implies correct behaviour. One sentence can be added to the "Project detection" section confirming that project names with spaces are handled automatically, but this is optional polish.
