# Phase 1 Data Model: Download images from markdown field

The feature is stateless (no persistence beyond writing image files). The "model" is the
in-memory shapes passed through the new service.

## EmbeddedImageReference

A single image discovered inside a rich-text field.

| Field | Type | Notes |
|-------|------|-------|
| `url` | `string` | Absolute Azure DevOps attachment URL from the `<img src>` |
| `sourceField` | `string` | Reference name of the field it was found in (e.g. `System.Description`) |
| `index` | `number` | 1-based order of appearance across scanned fields; used in the output filename |
| `suggestedExtension` | `string` | Extension derived from the URL `fileName` query param (default `.png`) |

**Validation / rules**:
- Only created for `<img>` tags whose `src` is an Azure DevOps attachment URL on the
  org host. External URLs are skipped (FR-014).
- Duplicate identical `url`s within the same field are de-duplicated (one reference per
  distinct image) per spec edge case.

## ImageDownloadOptions

Resolved options driving the download/resize behaviour.

| Field | Type | Notes |
|-------|------|-------|
| `enabled` | `boolean` | True when `--download-images` or `--resize-images` is present |
| `maxWidth` | `number \| undefined` | From `--resize-images <N>`; positive integer; undefined = no resize |
| `outputDir` | `string` | `--images-path` value, else `os.tmpdir()` |

**Validation / rules**:
- `maxWidth`, when present, MUST be a positive integer (FR-007); otherwise fail fast.
- `outputDir` MUST exist; otherwise clear error + non-zero exit (mirrors
  `download-attachment`).

## SavedImageResult

Outcome for one image after the download/resize/write attempt.

| Field | Type | Notes |
|-------|------|-------|
| `reference` | `EmbeddedImageReference` | The source reference |
| `path` | `string \| undefined` | Absolute path written, or undefined on failure |
| `resized` | `boolean` | True if the image was scaled down |
| `format` | `string` | `png` when resized; otherwise the original format |
| `error` | `string \| undefined` | Failure reason (download/resize/write), if any |

**Rules**:
- A failed result (`error` set) does not abort processing of the others (FR-009).
- The command's summary line counts results with a defined `path` as "saved".

## Filename derivation

`wi-<workItemId>-<index><ext>` where `<ext>` = `.png` when `maxWidth` triggers a resize
or PNG re-encode, else `suggestedExtension`. Written under `outputDir`. Index-based →
collision-free within a run.
