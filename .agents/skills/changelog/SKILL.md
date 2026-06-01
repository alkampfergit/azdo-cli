---
name: changelog
description: Keep a slim, human-readable CHANGELOG. The root CHANGELOG.md holds only a short stanza per release (theme + a few brief bullets + a link); full per-release detail lives in docs/changelogs/<version>.md, with docs/changelogs/unreleased.md accumulating the next release. Versions follow the tags on master — if master is at 0.11.x, unreleased work on develop belongs to 0.12.0. Use when the user says "record a changelog entry", "update the changelog", "finalise the changelog for a release", or "split the changelog".
disable-model-invocation: false
---

# changelog — slim index + detailed per-release files

A single monolithic `CHANGELOG.md` becomes unbearable. This skill keeps the
root file **slim** — one short stanza per release — and pushes the full,
categorised detail into one file per version under `docs/changelogs/`.

```
CHANGELOG.md                      ← slim index: theme + 3-5 brief bullets + link, per release
docs/changelogs/
  unreleased.md                   ← full detail accumulating for the NEXT release
  0.11.0.md                       ← full detail for a shipped release
  0.10.1.md
  ...
```

**Sibling skills:** `gitflow` (cuts the tag/release; it deliberately does
**not** touch the changelog — this skill does, as a separate step). When a
release issue is processed, finalise the changelog *with this skill* either
just before or right after `gitflow` tags.

## Versioning model (read this first)

Released versions are defined by the **tags on `master`**. Work merged to
`develop` is not yet released — it accumulates under "Unreleased" and ships in
the **next minor** version.

- "Next version" = bump the **minor** of the latest tag on `master` (default).
  So if `master` is at `0.11.x`, everything on `develop` is part of `0.12.0`.
- Resolve it the same way `gitflow` does:
  ```bash
  LATEST_TAG=$(git -c versionsort.suffix=-rc -c versionsort.suffix=-beta \
    tag --list --merged master --sort=-v:refname | head -n1)
  # strip a leading 'v'; parse X.Y.Z; next default = X.(Y+1).0
  ```
  If the latest tag does not match `^\d+\.\d+\.\d+$`, or there is no tag, ask
  the caller for the target version — don't invent one.
- A `release/X.Y.Z` branch in flight means `X.Y.Z` is the version being cut
  *now*; the unreleased detail belongs to it. (Branch present but not yet
  tagged → treat `X.Y.Z` as the imminent release, not the next-next minor.)

## File formats (keep the root SLIM)

### Root `CHANGELOG.md` — the index

Reverse-chronological. Each released version is **at most** a one-line theme
plus 3–5 brief bullets and a link to its detail file. No long lists here — if
a stanza grows past ~6 lines, the detail belongs in `docs/changelogs/`.

```markdown
# Changelog

All notable changes to **azdo-cli** are summarised here — one short stanza per
release. Full per-release detail lives in [`docs/changelogs/`](docs/changelogs/).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/);
the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

_Targeting **0.12.0**. Working detail: [`docs/changelogs/unreleased.md`](docs/changelogs/unreleased.md)._

- <one brief line per notable change going into the next release>

## [0.11.0] - 2026-05-30 — OAuth login & richer PR comments

OAuth is the default `azdo auth login` flow; PR commands gain comment threads
and resolve/reopen. → [details](docs/changelogs/0.11.0.md)

## [0.10.1] - 2026-04-15 — <short theme>

<one or two lines> → [details](docs/changelogs/0.10.1.md)
```

### `docs/changelogs/<version>.md` — the detail

Full Keep-a-Changelog categories. Only include categories that have entries.

```markdown
# 0.11.0 — 2026-05-30

> One-paragraph summary of what this release is about.

### Added
- **OAuth login** — `azdo auth login` defaults to OAuth, PAT remains a fallback (#38)

### Changed
- ...

### Fixed
- **`azdo pr comments` crash** — tolerant `_links`, libuv-safe exit (#…)

### Removed / Deprecated / Security
- (only if applicable)
```

### `docs/changelogs/unreleased.md` — accumulator for the next release

Same category structure; this is where day-to-day detail lands and is renamed
to `<version>.md` at release time.

```markdown
# Unreleased — targeting 0.12.0

> Working detail for the next release. Finalised into
> `docs/changelogs/0.12.0.md` when the release is cut.

### Added
### Changed
### Fixed
```

## Operations

The skill has three jobs. Pick by what the caller asks.

### 1. `record` — log a change (the common case)

When a feature lands on `develop` (or the caller asks to note a change):

1. Resolve the next version (see *Versioning model*) so the "targeting" line
   is correct.
2. Append the **full** entry to `docs/changelogs/unreleased.md` under the right
   category (`Added` / `Changed` / `Fixed` / `Removed` / `Deprecated` /
   `Security`). Include the PR/issue number when known.
3. Ensure the root `CHANGELOG.md` `## [Unreleased]` block exists, its
   "targeting" line names the right version, and add **one brief bullet**
   summarising the change. Do not duplicate the full detail here.
4. Keep both edits to the same change in one commit when committing.

Brief vs. detail rule of thumb: if the root bullet needs more than one line or
a sub-list, the extra goes in the detail file, not the root.

### 2. `release` — finalise for a shipped version `X.Y.Z`

Run this when a release is being cut (alongside `gitflow`). Given `X.Y.Z`:

1. Set the release date: `DATE=$(date +%Y-%m-%d)`.
2. Promote the accumulator:
   - Rename `docs/changelogs/unreleased.md` → `docs/changelogs/X.Y.Z.md`
     (`git mv` if tracked).
   - Replace its top heading with `# X.Y.Z — <DATE>` and add/keep the
     one-paragraph summary. Drop empty categories.
3. Update the root `CHANGELOG.md`:
   - Convert the `## [Unreleased]` content into a new released stanza
     `## [X.Y.Z] - <DATE> — <theme>` with 3–5 brief bullets and a
     `→ [details](docs/changelogs/X.Y.Z.md)` link, inserted at the top of the
     release list.
   - Reset `## [Unreleased]` to an empty block whose "targeting" line names the
     **new** next version (minor bump of `X.Y.Z`, e.g. after `0.12.0` →
     targeting `0.13.0`).
4. Recreate a fresh empty `docs/changelogs/unreleased.md` from the template
   above, targeting the new next version.
5. Do **not** tag, push, or create a GitHub Release — that's `gitflow`'s job.
   This skill only edits files. Commit them on the release branch (or hand the
   staged changes back to the caller, per the release flow in use).

### 3. `bootstrap` / `migrate` — set up the structure or split a monolith

If the structure is missing or the root `CHANGELOG.md` is a giant monolith:

1. Create `docs/changelogs/` if absent.
2. If a monolithic `CHANGELOG.md` exists, **split it**: for each `## [X.Y.Z]`
   section, move its body into `docs/changelogs/X.Y.Z.md` (add the
   `# X.Y.Z — <date>` heading and a summary), and leave a slim stanza + link in
   the root. Process newest-first; you may stop after a caller-specified depth
   and note in the root that older detail predates the split.
3. Write a fresh slim root `CHANGELOG.md` and an empty
   `docs/changelogs/unreleased.md` targeting the next version.
4. Never **fabricate** history. If the existing file's content does not match
   this project (e.g. it's another project's changelog) or detail is missing,
   surface that to the caller and reconstruct only from what's verifiable
   (tags, merged PRs, git log) — don't invent entries.

## Guardrails

- The root file stays slim. If you find yourself pasting a long list into
  `CHANGELOG.md`, stop — it belongs in `docs/changelogs/<version>.md`.
- One detail file per **released** version; `unreleased.md` is the only
  in-progress file.
- Dates are `YYYY-MM-DD` from `date +%Y-%m-%d`; never guess.
- Version headings and tags drop any leading `v` (repo convention — bare
  `X.Y.Z`), matching the `gitflow` skill.
- Links in the root use repo-relative paths so they resolve on the Git host.
- Editing files only — no tagging, pushing, or releasing here.

## Example invocations

- `/changelog record` — add an entry for the change just merged to `develop`.
- `/changelog record "fixed: pr comments crash on missing _links (#43)"` —
  record a specific line.
- `/changelog release 0.11.0` — finalise the changelog for the 0.11.0 release.
- `/changelog bootstrap` — create the slim index + `docs/changelogs/` layout.
- `/changelog migrate` — split an existing monolithic CHANGELOG.md.
