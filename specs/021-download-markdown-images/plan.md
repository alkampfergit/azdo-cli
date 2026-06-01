# Implementation Plan: Download images from markdown field

**Branch**: `021-download-markdown-images` | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/021-download-markdown-images/spec.md`

## Summary

Add opt-in image download to **both** existing work-item retrieval commands — `get-item`
(whole work item) and `get-md-field` (a single field). When `--download-images` is
supplied, the command scans the relevant rich-text field(s) for embedded Azure DevOps
attachment images — both HTML `<img src="…/_apis/wit/attachments/…">` and Markdown
`![alt](…/_apis/wit/attachments/…)` (native Markdown fields), de-duplicated by attachment
GUID — downloads each via the existing `downloadAttachment` transport, and writes them to
the system temp directory (or a `--images-path` override). When `--resize-images <N>` is supplied it implicitly enables
download and additionally scales any image wider than `N` px down to `N` (aspect
preserved, never upscaled), re-encoding the result as PNG. The extraction/download/resize
logic lives in **one shared service** used by both commands; `get-item` scans the
description + requested rich `--fields`, `get-md-field` scans the single requested field's
HTML. Downloading is strictly additive — each command's existing text/markdown output is
unchanged.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)  
**Primary Dependencies**: commander.js (CLI, existing), native `fetch` (existing, via `downloadAttachment`), `node:fs/promises` + `node:path` + `node:os` (built-in, file/temp-dir I/O), **`jimp` (new — pure-JS image resize/encode)**  
**Storage**: Local filesystem — image files written to OS temp dir by default or a `--images-path` directory  
**Testing**: vitest (unit); integration tests gated behind real-credential env (existing pattern)  
**Target Platform**: Node.js LTS (≥18), cross-platform CLI  
**Project Type**: Single-project CLI (commander.js)  
**Performance Goals**: Interactive CLI — download/resize a handful of images per work item within a few seconds; no throughput target  
**Constraints**: Bundle cleanly with tsup (no native binaries); strict TS, no `any`; opt-in only (zero side effects without the flag)  
**Scale/Scope**: One work item per invocation; typically 0–N embedded images

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| **I. CLI-First Design** | ✅ Implemented as opt-in flags on the existing `get-item` command; output to stdout, errors to stderr, meaningful exit codes. |
| **II. TypeScript Strictness** | ✅ All new code strict-typed; no `any`. Image refs and download results get explicit interfaces. |
| **III. Single Responsibility** | ✅ Image extraction/download/resize logic lives in a new `src/services/image-download.ts` service, **shared by both `get-item` and `get-md-field`**; each command only wires flags → service. No duplication, no unrelated operations combined. |
| **IV. npm Distribution** | ⚠️ Adds one runtime dependency (`jimp`). Justified in Complexity Tracking — chosen specifically because it is **pure-JS and bundles with tsup** (no native binaries), unlike `sharp`. |
| **V. Simplicity** | ✅ Reuses existing `downloadAttachment`; default destination is the system temp dir (no new config file); flags only. |

**Gate result**: PASS (one justified dependency — see Complexity Tracking).

Additional binding constraint from the constitution / `AGENTS.md`:
- **README.md MUST be reviewed/updated** to document the new flags before merge (Development Workflow).
- Run `npm test && npm run lint` (and `npm run build`) before marking ready.

## Project Structure

### Documentation (this feature)

```text
specs/021-download-markdown-images/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── get-item-images-cli.md   # CLI contract for the new flags
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── commands/
│   ├── get-item.ts            # MODIFIED: add --download-images, --resize-images, --images-path; scan description + rich --fields; wire to service
│   └── get-md-field.ts        # MODIFIED: add the same three flags; scan the single requested field's HTML; wire to service
├── services/
│   ├── azdo-client.ts         # REUSED: downloadAttachment(url, credential); getWorkItemFieldValue (get-md-field)
│   └── image-download.ts      # NEW (shared): extract attachment image refs (<img> AND ![](url), GUID-deduped), download, optional resize→PNG, write to disk; resolve+validate options; format summary
└── types/
    └── work-item.ts           # MAYBE: add an EmbeddedImage type (or co-locate in service)

tests/
├── unit/
│   ├── image-download.test.ts # NEW: extraction (<img> AND ![](url) parsing, ADO-only filter, GUID dedupe across both forms), naming, resize decision, option validation
│   ├── get-item.test.ts       # EXTENDED: flag parsing / opt-in guarantee (no write without flag)
│   └── get-md-field.test.ts   # EXTENDED/NEW: same flags on get-md-field; opt-in guarantee; markdown output unchanged
└── integration/
    └── (existing real-credential pattern; optional WI-41748 manual check via quickstart)
```

**Structure Decision**: Single-project CLI (Option 1). The feature extends the existing
`get-item` **and** `get-md-field` commands, both delegating to one focused, shared service
module — matching the established `commands/` + `services/` layout and Principle III
(shared logic extracted, not duplicated).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| New runtime dependency `jimp` | Resizing requires decoding/re-encoding raster images (PNG/JPEG) — not feasible with built-ins | `sharp` rejected: native binaries break the single-executable tsup bundle and complicate npm distribution (Principle IV). Hand-rolled resizing rejected: image codecs are out of scope to reimplement (Principle V). `jimp` is pure-JS, bundles cleanly, supports resize + PNG output. |
