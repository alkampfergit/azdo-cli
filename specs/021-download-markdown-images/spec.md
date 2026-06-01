# Feature Specification: Download images from markdown field

**Feature Branch**: `021-download-markdown-images`  
**Created**: 2026-06-01  
**Status**: Draft  
**Input**: User description: "Download images embedded in a work item markdown field. Opt-in only: a `--download-images` flag triggers download; a `--resize-images <N>` flag sets the max horizontal size and saves resized images as PNG for LLM consumption. Test with work item 41748 that contains an image."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Download images embedded in a work item's rich-text fields (Priority: P1)

A user retrieves a work item whose rich-text (markdown) field contains one or
more embedded images. Today the command shows the field text but the images
remain only as references hosted in Azure DevOps. The user wants an explicit,
opt-in way to also pull those images down to local files so they can be
inspected, archived, or fed to other tools offline.

**Why this priority**: This is the core ask. Without it the feature delivers
nothing. It is independently valuable: simply getting the images onto disk —
at their original size — already solves the "I need the picture, not just a
link" problem.

**Independent Test**: Run the work-item retrieval command for work item
**41748** (known to contain an image) with the download option enabled, and
confirm the embedded image is written to a local file while the command's
normal text output is unchanged.

**Acceptance Scenarios**:

1. **Given** a work item with one embedded image in a rich-text field, **When** the user runs the retrieval command with `--download-images`, **Then** the image is saved to a local file and the command reports where it was saved.
2. **Given** the same work item, **When** the user runs the retrieval command **without** `--download-images`, **Then** no image file is written (download is strictly opt-in).
3. **Given** a work item with several embedded images, **When** the user runs the command with `--download-images`, **Then** every embedded image is saved as a separate file.
4. **Given** a work item with no embedded images, **When** the user runs the command with `--download-images`, **Then** the command completes normally and reports that no images were found, without error.

---

### User Story 2 - Resize downloaded images for LLM consumption (Priority: P2)

A user intends to feed the downloaded images to a large language model and does
not need full-resolution originals. They want to cap the horizontal size of
each saved image so the files are smaller and cheaper to process, accepting
that very large images will be scaled down.

**Why this priority**: A useful refinement on top of User Story 1, but the
download itself (P1) is valuable without it. Resizing only matters once images
are reliably reaching disk.

**Independent Test**: Run the retrieval command with `--download-images
--resize-images 1024` against work item 41748 and confirm the saved image's
width does not exceed 1024 pixels, the aspect ratio is preserved, and the file
is a PNG.

**Acceptance Scenarios**:

1. **Given** an embedded image wider than the requested maximum, **When** the user runs with `--resize-images 1024`, **Then** the saved image is scaled down so its width equals the maximum, its aspect ratio is preserved, and it is saved as a PNG.
2. **Given** an embedded image already narrower than or equal to the requested maximum, **When** the user runs with `--resize-images 1024`, **Then** the image is not enlarged (no upscaling) and is saved as a PNG at its original dimensions.
3. **Given** `--resize-images` is supplied with a value that is not a positive whole number, **When** the command runs, **Then** it fails fast with a clear validation message and downloads nothing.

---

### Edge Cases

- **Resize without download**: If `--resize-images` is given but `--download-images` is not, `--resize-images` implicitly enables download (resizing requested ⇒ images are downloaded). It is never an error to supply `--resize-images` alone.
- **Download without resize (format)**: With `--download-images` only (no `--resize-images`), images are saved in their original format and bytes (no re-encoding). Resizing to PNG happens only when `--resize-images` is supplied.
- **An image reference cannot be fetched** (deleted attachment, permission denied, network error): the command saves the images it can, reports each failure clearly (which image, why), and does not abort the whole retrieval.
- **Duplicate or repeated image references** in the same field: each distinct image is saved once; the command does not overwrite a previously saved file from the same run with a different image.
- **Non-image references** in the rich-text field (links to documents, other work items): these are ignored; only images are downloaded.
- **A field references an image hosted outside Azure DevOps** (absolute external URL): [NEEDS CLARIFICATION: are externally-hosted images in scope, or only attachments hosted by Azure DevOps?].

## Clarifications

### Session 2026-06-01

- Q: If `--resize-images` is supplied without `--download-images`, is it an error or does it imply download? → A: `--resize-images` implicitly enables download. [owner: alkampfergit, 2026-06-01]

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The work-item retrieval command MUST accept an opt-in `--download-images` flag that, when present, downloads images embedded in the work item's rich-text (markdown) fields to local files.
- **FR-002**: When `--download-images` is absent, the command MUST NOT write any image files — image download is strictly opt-in and never automatic.
- **FR-003**: The command MUST detect every distinct embedded image reference within the retrieved rich-text field(s) and save each as a separate local file.
- **FR-004**: The command MUST accept an optional `--resize-images <N>` flag specifying the maximum horizontal size (width, in pixels) for saved images.
- **FR-005**: When `--resize-images <N>` is supplied, the command MUST scale down any image wider than `N` so its width equals `N`, preserving the original aspect ratio, and MUST save the result as a PNG.
- **FR-006**: When `--resize-images <N>` is supplied, the command MUST NOT enlarge images that are already at or below `N` pixels wide; such images are saved as PNG without upscaling.
- **FR-007**: The command MUST validate that `--resize-images` is a positive whole number and MUST fail fast with a clear message (downloading nothing) when it is not.
- **FR-008**: After a successful run with `--download-images`, the command MUST report to the user how many images were saved and where (file paths).
- **FR-009**: If an individual image cannot be downloaded, the command MUST report that specific failure (which image and why) and continue with the remaining images and the command's normal output, rather than aborting.
- **FR-010**: When a work item has no embedded images, the command with `--download-images` MUST complete successfully and inform the user that no images were found.
- **FR-011**: Enabling image download MUST NOT change the command's existing text/markdown output behaviour; downloading is an additive side effect.
- **FR-013**: Supplying `--resize-images <N>` MUST implicitly enable image download even when `--download-images` is not given; it MUST NOT be treated as a validation error.
- **FR-012**: Downloaded images MUST be saved to [NEEDS CLARIFICATION: output location and file-naming scheme not specified — e.g. current directory, a per-work-item subfolder, or a path supplied via a flag? what naming avoids collisions across images and across runs?].

### Key Entities *(include if data involved)*

- **Embedded image reference**: A pointer to an image found inside a work item's rich-text field. Has a source location (where it is fetched from) and, once downloaded, a local file path, a format, and pixel dimensions.
- **Work item rich-text field**: A field whose content may contain embedded image references (the source the command scans).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can download all images embedded in a work item's rich-text field with a single command invocation, with no manual copying of links.
- **SC-002**: For work item 41748, running with `--download-images` saves the embedded image to disk; the saved file opens as a valid image.
- **SC-003**: When `--resize-images N` is used, 100% of saved images have a width no greater than N pixels and retain their original aspect ratio.
- **SC-004**: Running the command without `--download-images` never produces an image file (0 unintended downloads), confirming the opt-in guarantee.
- **SC-005**: When one image among several fails to download, at least the remaining downloadable images are still saved and the command still completes (partial success is reported, not a hard failure).

## Assumptions

- The feature extends the existing work-item retrieval command rather than introducing a separate command, since the images live in the fields that command already retrieves.
- "Images" means raster images embedded/referenced in the rich-text field (e.g. screenshots pasted into a Description). Links to non-image resources are out of scope.
- "Max horizontal size" refers to image width in pixels; aspect ratio is always preserved and images are never upscaled.
- Resizing always produces PNG output; non-resized downloads keep their original format.
- The work item's rich-text fields already retrieved/displayed by the command are the scope for image scanning (no new fields are fetched solely to find images).
