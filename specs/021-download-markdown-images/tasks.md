---
description: "Task list for Download images from markdown field (issue #44)"
---

# Tasks: Download images from markdown field

**Input**: Design documents from `/specs/021-download-markdown-images/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/get-item-images-cli.md, quickstart.md

**Tests**: Included — the project uses vitest and `AGENTS.md` expects `npm test && npm run lint` to pass; unit tests are written for the extraction/validation/resize logic.

**Organization**: Tasks grouped by user story. US1 (download, P1) is the MVP; US2 (resize, P2) builds on it. Both apply to `get-item` and `get-md-field` via one shared service.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- File paths are relative to repo root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bring in the one new dependency and the type surface.

- [ ] T001 Add `jimp` as a runtime dependency in `package.json` (`npm install jimp`), then run `npm run build` to confirm it bundles cleanly with tsup (no native binary errors).
- [X] T002 [P] Define `EmbeddedImageReference`, `ImageDownloadOptions`, and `SavedImageResult` interfaces (per data-model.md) at the top of the new file `src/services/image-download.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared `image-download` service that both commands and both user stories depend on — everything except the resize behaviour (US2).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Implement `extractImageReferences(htmlOrMd: string, sourceField: string): EmbeddedImageReference[]` in `src/services/image-download.ts`: scan for HTML `<img src="…">` **first**, then Markdown `![alt](url)`; keep only URLs matching the Azure DevOps attachment endpoint (`_apis/wit/attachments/<guid>`); de-duplicate by attachment GUID (FR-003, FR-003a, FR-014).
- [X] T004 [P] Implement attachment-URL helpers in `src/services/image-download.ts`: parse the `<guid>` and the `fileName` query param, derive `suggestedExtension` (default `.png`), and build the collision-free output filename `wi-<workItemId>-<index><ext>` (data-model.md "Filename derivation").
- [X] T005 [P] Implement `resolveImageDownloadOptions(flags): ImageDownloadOptions` in `src/services/image-download.ts`: set `enabled` when `--download-images` OR `--resize-images` present; validate `--resize-images` is a positive integer (else throw a clear error — FR-007); default `outputDir` to `os.tmpdir()`, else `--images-path`; verify the directory exists (clear error + non-zero exit if not, mirroring `download-attachment`).
- [X] T006 Implement the download+write loop (original format, no resize) in `src/services/image-download.ts`: for each reference call the existing `downloadAttachment(url, credential)` from `services/azdo-client.ts`, write bytes to `outputDir/<filename>`, capture a `SavedImageResult`; on a per-image error record the failure and continue (FR-009).
- [X] T007 [P] Implement `formatImageSummary(results): string` in `src/services/image-download.ts`: "Images: N downloaded" + each saved path, or "Images: no images found …" when none (FR-008, FR-010).
- [X] T008 Expose the shared entry point `downloadImagesFromHtml(fragments: {html: string; field: string}[], args: {workItemId: number; options: ImageDownloadOptions}, credential): Promise<SavedImageResult[]>` in `src/services/image-download.ts`, wiring extraction → download/write → results (resize hook left for US2).

**Checkpoint**: Shared service can extract ADO attachment images (both syntaxes) and download them at original size.

---

## Phase 3: User Story 1 - Download embedded images (Priority: P1) 🎯 MVP

**Goal**: Opt-in `--download-images` (+ `--images-path`) on both `get-item` and `get-md-field`, saving embedded images at original size.

**Independent Test**: `azdo boards get-item 41748 --download-images` saves the embedded image to the temp dir and prints the path; without the flag, no file is written.

### Tests for User Story 1

- [X] T009 [P] [US1] Unit tests in `tests/unit/image-download.test.ts`: `<img>` extraction, `![](url)` extraction, ADO-attachment-only filter (external URLs ignored), GUID de-dup across both forms, filename derivation, and `resolveImageDownloadOptions` (opt-in on/off, `--images-path` existence). Write first; ensure they fail.
- [X] T010 [P] [US1] Unit test in `tests/unit/get-item.test.ts`: with no image flags, the command writes no files (opt-in guarantee) and existing output is unchanged.
- [X] T011 [P] [US1] Unit test in `tests/unit/get-md-field.test.ts`: `--download-images` triggers a download of the field's images; without it, only markdown is printed (no files). Markdown output unchanged.

### Implementation for User Story 1

- [X] T012 [US1] Add `--download-images` and `--images-path <dir>` options to `createGetItemCommand()` in `src/commands/get-item.ts`; after fetching the work item, collect Description (+ requested rich `--fields`) HTML and call `downloadImagesFromHtml`; print the summary after the existing output (FR-001, FR-002, FR-011).
- [X] T013 [US1] Add `--download-images` and `--images-path <dir>` options to `createGetMdFieldCommand()` in `src/commands/get-md-field.ts`; pass the raw field value (the HTML/markdown returned by `getWorkItemFieldValue`, before/after `toMarkdown` as appropriate) into `downloadImagesFromHtml`; print markdown as today, then the summary (FR-001 for get-md-field).
- [X] T014 [US1] Ensure per-image download failures are reported to stderr (which image + reason) without aborting the command or remaining downloads, in both command wirings (FR-009).

**Checkpoint**: US1 fully functional on both commands — images download at original size, opt-in, partial-failure tolerant.

---

## Phase 4: User Story 2 - Resize downloaded images (Priority: P2)

**Goal**: `--resize-images <N>` caps image width (aspect preserved, no upscaling), re-encodes as PNG, and implicitly enables download — on both commands.

**Independent Test**: `azdo boards get-item 41748 --resize-images 1024` saves PNGs ≤ 1024 px wide (aspect preserved); `--resize-images 800` alone (no `--download-images`) still downloads.

### Tests for User Story 2

- [X] T015 [P] [US2] Unit tests in `tests/unit/image-download.test.ts`: resize decision (downscale when wider than N; never upscale; aspect preserved), PNG re-encode when resizing, and `--resize-images` validation (reject 0 / negative / non-integer). Write first; ensure they fail.

### Implementation for User Story 2

- [X] T016 [US2] Implement resize-to-PNG in `src/services/image-download.ts` using `jimp`: when `options.maxWidth` is set and the image is wider, scale to width `maxWidth` preserving aspect; always re-encode to PNG when `maxWidth` is set; never upscale; set `resized`/`format` on the result (FR-005, FR-006). Hook into the T008 entry point.
- [X] T017 [P] [US2] Add `--resize-images <N>` option to `createGetItemCommand()` in `src/commands/get-item.ts` (parsed via `resolveImageDownloadOptions`; implies download — FR-013).
- [X] T018 [P] [US2] Add `--resize-images <N>` option to `createGetMdFieldCommand()` in `src/commands/get-md-field.ts` (implies download — FR-013).

**Checkpoint**: Both commands support download + resize; US1 still works unchanged.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T019 [P] Update `README.md` to document `--download-images`, `--resize-images <N>`, `--images-path <dir>` on `get-item` and `get-md-field` (Constitution Development Workflow — MUST be done before merge).
- [ ] T020 [P] Update `docs/commands.md` with the new flags and examples (both commands; HTML + markdown field note).
- [ ] T021 File a follow-up GitHub issue: authoritative HTML-vs-Markdown field-format detection via `multilineFieldsFormat`, plus the `isHtml()` mixed-content misclassification fix (deferred from #44 per owner decision). Do NOT mention any GitHub bot.
- [ ] T022 Run `npm test && npm run lint && npm run build`; fix any failures.
- [ ] T023 Execute `specs/021-download-markdown-images/quickstart.md` steps against work item 41748 to validate end-to-end (SC-002, SC-003).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; BLOCKS both user stories.
- **US1 (Phase 3)**: depends on Foundational. MVP.
- **US2 (Phase 4)**: depends on Foundational; reuses US1's command wiring (adds the resize flag + service resize path). Independently testable.
- **Polish (Phase 5)**: depends on the user stories being complete.

### Within Each User Story

- Tests written first and failing before implementation.
- Service logic (Phase 2) before command wiring (US1/US2).

### Parallel Opportunities

- T002, T004, T005, T007 (different concerns / [P]) can overlap once the file exists.
- All US1 test tasks (T009–T011) run in parallel; US2 test (T015) in parallel.
- T012 and T013 touch different command files → parallelisable; same for T017/T018.
- T019, T020 (docs) parallel.

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1.
2. **STOP and VALIDATE**: download works on both commands, opt-in honoured.

### Incremental Delivery

1. Setup + Foundational → service ready.
2. US1 → download at original size → MVP.
3. US2 → resize-to-PNG.
4. Polish → README/docs, follow-up issue, quickstart, gates green.

---

## Notes

- [P] = different files, no dependencies.
- Both commands delegate to the single `src/services/image-download.ts` (Constitution III — no duplication).
- `jimp` is the only new dependency (US2/resize); pure-JS, bundles with tsup.
- Commit after each task or logical group; commit scope `#44`.
