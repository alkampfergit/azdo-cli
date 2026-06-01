# CLI Contract: get-item image download

Extends the existing `azdo boards get-item <id>` command with three options.

## New options

| Option | Argument | Default | Description |
|--------|----------|---------|-------------|
| `--download-images` | none (boolean) | off | Download images embedded in the work item's rich-text fields. |
| `--resize-images <N>` | positive integer | unset | Max image width in px. Implies `--download-images`. Resized images saved as PNG. |
| `--images-path <dir>` | existing directory | OS temp dir | Destination directory for saved images. |

## Behaviour contract

### Opt-in
- Without `--download-images` and without `--resize-images`: **no image files are written.**
- `--resize-images <N>` alone enables download (implies `--download-images`).

### Resize
- `--resize-images N` with non-positive / non-integer `N` → stderr error, exit code ≠ 0, **nothing downloaded**.
- Image wider than `N` → scaled to width `N`, aspect preserved, saved as PNG.
- Image at/below `N` → not upscaled, saved as PNG.
- Without `--resize-images` → images saved in original format/bytes.

### Scope
- Only images hosted as Azure DevOps attachments are downloaded. External (`http(s)`
  non-ADO) image URLs are ignored.

### Output / exit
- Existing work-item text/markdown output is unchanged and still printed.
- After downloading, a summary is printed to stdout: number saved + each path.
- No images found → explicit "no images found" message, exit code 0.
- A single image failing to download → reported to stderr (which image + why); remaining
  images still saved; command still exits 0 (partial success).
- `--images-path` pointing at a non-existent directory → stderr error, exit ≠ 0.

## Examples

```bash
# Download embedded images at original size to the temp dir
azdo boards get-item 41748 --download-images

# Download + cap width at 1024 px, saved as PNG, into ./img
azdo boards get-item 41748 --resize-images 1024 --images-path ./img

# Resize implies download (no --download-images needed)
azdo boards get-item 41748 --resize-images 800
```

## Example output (human-readable)

```
ID:          41748
Type:        Bug
Title:       ...
...
Description:
...

Images: 1 downloaded
  /tmp/wi-41748-1.png
```

```
# no embedded images
Images: no images found in rich-text fields
```
