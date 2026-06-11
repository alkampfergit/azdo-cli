# Quickstart: Download images from markdown field

Validates the feature end-to-end against the owner's test work item **41748**.

## Prerequisites

- Authenticated: `azdo auth login` (or PAT configured) for the org hosting WI 41748.
- Built CLI: `npm run build`.

## 1. Download embedded images at original size

```bash
azdo boards get-item 41748 --download-images
```

**Expect**: normal work-item output, then an `Images: N downloaded` summary listing
file paths in the system temp directory. The saved file opens as a valid image. (SC-002)

## 2. Opt-in guarantee

```bash
azdo boards get-item 41748
```

**Expect**: normal output, **no** image files written, no `Images:` summary. (SC-004)

## 3. Resize for LLM consumption

```bash
azdo boards get-item 41748 --resize-images 1024 --images-path ./out
```

**Expect**: each saved file is a PNG in `./out`, width ≤ 1024 px, aspect ratio preserved.
Images already ≤ 1024 px wide are not upscaled. (SC-003)

## 4. Resize implies download

```bash
azdo boards get-item 41748 --resize-images 800
```

**Expect**: images downloaded (resized to ≤ 800 px PNG) even though `--download-images`
was not passed. (FR-013)

## 5. Validation

```bash
azdo boards get-item 41748 --resize-images 0
azdo boards get-item 41748 --resize-images abc
```

**Expect**: clear error on stderr, non-zero exit, no files written. (FR-007)

## 6. Same flags on `get-md-field`

```bash
# Print the field as markdown (as today) AND download its embedded images
azdo boards get-md-field 41748 System.Description --download-images

# Resize variant
azdo boards get-md-field 41748 System.Description --resize-images 1024 --images-path ./out
```

**Expect**: the field's markdown is printed exactly as before, and the field's embedded
image(s) are saved (resized to ≤ 1024 px PNG in the second case). Without
`--download-images`/`--resize-images`, only the markdown prints — no files. (US1 scenarios 5–6)

## 7. No images present

```bash
azdo boards get-item <id-with-no-embedded-images> --download-images
```

**Expect**: `Images: no images found`, exit 0. (FR-010)

## Automated checks

```bash
npm run test:unit      # image-download extraction / naming / resize-decision / validation
npm test && npm run lint
npm run build
```
