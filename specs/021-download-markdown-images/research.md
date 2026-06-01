# Phase 0 Research: Download images from markdown field

## R1: How are embedded images represented in a work item's rich-text field?

**Decision**: Extract image references from the raw field content using **two** patterns,
in order: (1) HTML `<img src="…">` tags, then (2) Markdown image syntax `![alt](url)`.
Treat a reference as in-scope only when the URL points at an Azure DevOps attachment
endpoint (`.../_apis/wit/attachments/<guid>` on the org host). **De-duplicate by the
attachment GUID** so an image referenced twice (or via both forms) downloads once.

**Rationale**: Azure DevOps now supports **native Markdown** multiline fields (GA
2025-07-07, api 7.1) in addition to **legacy HTML** fields:
- HTML field → images are `<img src="https://dev.azure.com/<org>/<project>/_apis/wit/attachments/<guid>?fileName=image.png">`.
- Native Markdown field → images are `![alt](https://dev.azure.com/.../_apis/wit/attachments/<guid>?fileName=image.png)` — **no `<img>` tags**.

An `<img>`-only scan would silently find nothing on a Markdown field (exit 0, "no images"),
which is a confidently-wrong result. Scanning both forms covers both field types; and since
raw HTML is valid inside Markdown too, the combined scan is robust to mixed content. The
attachment URL form is identical in both cases, so the download/resize path is unaffected.
(Owner decision 2026-06-01, Option A.)

**Out of scope (follow-up)**: authoritative HTML-vs-Markdown detection via the
`multilineFieldsFormat` field dictionary, and the existing `isHtml()` mixed-content
misclassification — both touch the shared read path but are deferred to a separate issue.

**Alternatives considered**:
- Using the work item's `attachments` relations list — rejected: lists *all* attachments,
  not specifically the images embedded inline in a given field; the `<img>`/`![]()` scan is
  precise to "images in the field".
- `<img>`-only extraction — rejected: misses every image in native Markdown fields.

## R2: Which fields are scanned, and on which commands?

**Decision**: The flags apply to **both** retrieval commands, using one shared service:
- **`get-item`**: scan the rich-text fields it already surfaces — `Description` plus any
  HTML `extraFields` requested via `--fields`.
- **`get-md-field`**: scan the single requested field's raw HTML (the value returned by
  `getWorkItemFieldValue` before the `toMarkdown` conversion).

Do not fetch new fields solely to find images (matches spec Assumption).

**Rationale**: `get-md-field` already retrieves the field HTML (`value`) and converts it to
markdown for display; the same HTML is exactly the input the image extractor needs, so the
shared `extractImageReferences(html)` works unchanged. Owner explicitly requested
`get-md-field` support (clarify 2026-06-01). Keeps scope aligned with what each command
already surfaces; honours Principles III (shared logic) and V (simplicity).

**Implementation note**: the service exposes a command-agnostic entry point, e.g.
`downloadImagesFromHtml(htmlFragments, { workItemId, options }, credential)`, that both
commands call after they have the field HTML in hand.

## R3: Download transport

**Decision**: Reuse `downloadAttachment(url, credential)` from `services/azdo-client.ts`
to fetch each image's bytes with the existing authenticated `fetch` path.

**Rationale**: The attachment endpoint and `<img src>` URL are the same kind of resource;
`downloadAttachment` already handles auth headers and error surfacing. Reuse satisfies
Principle III (no duplicated transport logic).

**Alternatives considered**: A new bespoke fetch — rejected (duplication).

## R4: Image resize + PNG encoding library

**Decision**: Add **`jimp`** as a runtime dependency for resize + PNG output.

**Rationale**:
- Pure-JavaScript (no native binaries) → bundles with `tsup` and preserves the
  single-executable npm distribution (Constitution Principle IV).
- Supports the exact operations needed: decode (PNG/JPEG/BMP/etc.), `scaleToFit` /
  resize by width preserving aspect, and `getBuffer('image/png')` for PNG output.
- Width-only resize preserving aspect ratio is a first-class operation.

**Alternatives considered**:
- `sharp` — fastest and most popular, but ships **native** prebuilt binaries per
  platform; this breaks the bundled single-file CLI and complicates `npm` install on
  arbitrary platforms. Rejected on Principle IV.
- Hand-rolled PNG/JPEG decode + nearest-neighbour resize — rejected on Principle V
  (reimplementing image codecs is disproportionate).

**Resize rule** (from spec FR-005/FR-006): if `imageWidth > N`, scale to width `N`
preserving aspect; else leave dimensions unchanged. Either way, when `--resize-images`
is set, re-encode as PNG. Never upscale.

## R5: Output destination and file naming

**Decision**: Default destination = the OS temp directory (`node:os` `tmpdir()`).
`--images-path <dir>` overrides it; the directory must exist (mirror
`download-attachment`'s existing behaviour: clear error + non-zero exit if missing).
File naming: `wi-<workItemId>-<index><ext>` where `<index>` is the 1-based order of the
image in the field, and `<ext>` is `.png` when resizing else the source extension
(derived from the URL `fileName` query param, defaulting to `.png`). This is collision-free
within a run and stable per work item.

**Rationale**: Matches the owner's clarify answer (temp dir default, `--images-path`
override). Index-based naming guarantees no two images overwrite each other (spec edge
case) without depending on possibly-duplicate original filenames.

**Alternatives considered**:
- Current working directory default — rejected: owner specified temp dir.
- Preserving original attachment filenames verbatim — rejected as the *sole* scheme:
  two embedded images can share a name; the `wi-<id>-<index>` prefix guarantees uniqueness.

## R6: Opt-in guarantee & error handling

**Decision**: No image I/O occurs unless `--download-images` or `--resize-images` is
present (the latter implies the former — FR-013). Per-image download failures are
reported to stderr (which image + reason) and do not abort the command or the remaining
downloads (FR-009); the normal work-item output still prints. `--resize-images` is
validated as a positive integer before any download; invalid → clear error, exit non-zero,
nothing downloaded (FR-007).

**Rationale**: Directly encodes the spec's opt-in and partial-success guarantees;
consistent with existing command error conventions (`handleCommandError`, stderr + exit).

## R7: Output reporting

**Decision**: After downloads, print a concise summary to stdout: count saved and each
saved path; if none found, an explicit "no images found" line. Keep it additive — printed
after the existing work-item output so `get-item`'s current behaviour is unchanged.

**Rationale**: FR-008/FR-010/FR-011.
