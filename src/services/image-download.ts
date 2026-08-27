import { Jimp } from 'jimp';
import type { Command } from 'commander';
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AuthCredential } from '../types/work-item.js';
import { downloadAttachment } from './azdo-client.js';

/** A single image embedded in a work item rich-text field, resolved to an Azure DevOps attachment. */
export interface EmbeddedImageReference {
  /** Absolute Azure DevOps attachment URL (HTML entities decoded). */
  url: string;
  /** Reference name of the field the image was found in (e.g. `Description`). */
  sourceField: string;
  /** Attachment GUID parsed from the URL — used for de-duplication. */
  guid: string;
  /** File extension derived from the URL `fileName` query param (default `.png`). */
  suggestedExtension: string;
}

/** Resolved options driving download/resize behaviour. */
export interface ImageDownloadOptions {
  /** True when `--download-images` or `--resize-images` is present. */
  enabled: boolean;
  /** Max image width in px from `--resize-images <N>`; undefined = no resize. */
  maxWidth?: number;
  /** Destination directory (system temp dir by default, or `--images-path`). */
  outputDir: string;
}

/** Raw flag values as parsed by commander. */
export interface ImageDownloadFlags {
  downloadImages?: boolean;
  resizeImages?: string;
  imagesPath?: string;
}

/** Outcome for one image after the download/resize/write attempt. */
export interface SavedImageResult {
  reference: EmbeddedImageReference;
  /** Absolute path written, or undefined on failure. */
  path?: string;
  /** True if the image was actually scaled down. */
  resized: boolean;
  /** `png` when re-encoded for resize, else the original extension (no dot). */
  format: string;
  /** Failure reason (download/resize/write), if any. */
  error?: string;
}

/** One rich-text field's raw content (HTML or Markdown) to scan for images. */
export interface FieldContent {
  content: string;
  field: string;
}

const ATTACHMENT_GUID_RE = /_apis\/wit\/attachments\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;

/**
 * Extract the attachment GUID from an Azure DevOps attachment URL
 * (`.../_apis/wit/attachments/<guid>?...`). Returns null if the URL doesn't
 * contain a recognizable attachment GUID.
 */
export function extractAttachmentGuid(url: string): string | null {
  const match = ATTACHMENT_GUID_RE.exec(url);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Only fetch attachments from Azure DevOps hosts. Without this check, a work item could
 * embed `https://evil.example/_apis/wit/attachments/<guid>` and the authenticated
 * downloader would leak the user's credential to that host. The rest of the CLI targets
 * `dev.azure.com`; `*.visualstudio.com` is the legacy host.
 */
function isAzureDevOpsAttachmentHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'dev.azure.com' || host.endsWith('.dev.azure.com') || host.endsWith('.visualstudio.com');
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function parseAttachmentReference(rawUrl: string, sourceField: string): EmbeddedImageReference | null {
  const url = decodeHtmlEntities(rawUrl.trim());

  // Must be an absolute https URL on an Azure DevOps host — otherwise downloading it would
  // send the user's auth credential to an arbitrary (possibly malicious) host.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || !isAzureDevOpsAttachmentHost(parsed.hostname)) {
    return null;
  }

  const guid = extractAttachmentGuid(parsed.pathname);
  if (!guid) return null;

  let suggestedExtension = '.png';
  const fileName = parsed.searchParams.get('fileName');
  if (fileName?.includes('.')) {
    suggestedExtension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  }

  return { url, sourceField, guid, suggestedExtension };
}

/**
 * Extract Azure DevOps attachment image references from one field's raw content.
 * Scans HTML `<img src>` first, then Markdown `![alt](url)`. Only URLs that point at
 * the work-item attachment endpoint are kept. De-duplicated by attachment GUID.
 */
export function extractImageReferences(content: string, sourceField: string): EmbeddedImageReference[] {
  if (!content) return [];

  const references: EmbeddedImageReference[] = [];
  const seen = new Set<string>();

  const add = (rawUrl: string): void => {
    const reference = parseAttachmentReference(rawUrl, sourceField);
    if (reference && !seen.has(reference.guid)) {
      seen.add(reference.guid);
      references.push(reference);
    }
  };

  // 1. HTML <img src="...">
  const imgRegex = /<img\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(content)) !== null) {
    add(match[1]);
  }

  // 2. Markdown ![alt](url) — stop the URL at whitespace or ')'.
  const markdownRegex = /!\[[^\]]*\]\(\s*([^)\s]+)/g;
  while ((match = markdownRegex.exec(content)) !== null) {
    add(match[1]);
  }

  return references;
}

/** Register the shared image-download options on a command (used by get-item and get-md-field). */
export function addImageDownloadOptions(command: Command): Command {
  return command
    .option('--download-images', 'download images embedded in rich-text fields to local files')
    .option('--resize-images <pixels>', 'max image width in px; downloads and resizes embedded images to PNG (implies --download-images)')
    .option('--images-path <dir>', 'destination directory for downloaded images (default: system temp dir)');
}

/**
 * Resolve the image-download flags, or print the validation error to stderr and exit(1).
 * Keeps the command actions free of duplicated try/catch boilerplate.
 */
export function resolveImageDownloadOptionsOrExit(flags: ImageDownloadFlags): ImageDownloadOptions {
  try {
    return resolveImageDownloadOptions(flags);
  } catch (err: unknown) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

/**
 * Resolve and validate the image-download flags.
 * Throws on an invalid `--resize-images` value or a missing `--images-path` directory,
 * before any download happens.
 */
export function resolveImageDownloadOptions(flags: ImageDownloadFlags): ImageDownloadOptions {
  const wantsResize = flags.resizeImages !== undefined;
  const enabled = Boolean(flags.downloadImages) || wantsResize;

  let maxWidth: number | undefined;
  if (wantsResize) {
    const parsed = Number(flags.resizeImages);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(
        `Invalid --resize-images value "${flags.resizeImages}": must be a positive integer (max width in pixels).`,
      );
    }
    maxWidth = parsed;
  }

  const outputDir = flags.imagesPath ?? tmpdir();
  if (flags.imagesPath !== undefined && !existsSync(outputDir)) {
    throw new Error(`Images path "${outputDir}" does not exist.`);
  }

  return { enabled, maxWidth, outputDir };
}

/** Build the collision-free output filename for one image. */
export function buildImageFileName(
  workItemId: number,
  index: number,
  reference: EmbeddedImageReference,
  resizing: boolean,
): string {
  const ext = resizing ? '.png' : reference.suggestedExtension;
  return `wi-${workItemId}-${index}${ext}`;
}

interface ProcessedImage {
  buffer: Buffer;
  resized: boolean;
  format: string;
}

async function processImageBytes(bytes: ArrayBuffer, maxWidth: number | undefined): Promise<ProcessedImage> {
  if (maxWidth === undefined) {
    return { buffer: Buffer.from(bytes), resized: false, format: 'original' };
  }

  const image = await Jimp.read(Buffer.from(bytes));
  let resized = false;
  if (image.bitmap.width > maxWidth) {
    image.resize({ w: maxWidth });
    resized = true;
  }
  const buffer = await image.getBuffer('image/png');
  return { buffer, resized, format: 'png' };
}

/**
 * Shared entry point: extract images from the given field contents (de-duped by GUID
 * across all fields), download each via the existing attachment transport, optionally
 * resize to PNG, and write to the output directory. Per-image failures are captured in
 * the result and do not abort the others.
 */
export async function downloadImagesFromFields(
  fields: FieldContent[],
  args: { workItemId: number; options: ImageDownloadOptions },
  credential: AuthCredential,
): Promise<SavedImageResult[]> {
  const { workItemId, options } = args;
  const resizing = options.maxWidth !== undefined;

  const seen = new Set<string>();
  const references: EmbeddedImageReference[] = [];
  for (const field of fields) {
    for (const reference of extractImageReferences(field.content, field.field)) {
      if (!seen.has(reference.guid)) {
        seen.add(reference.guid);
        references.push(reference);
      }
    }
  }

  const results: SavedImageResult[] = [];
  let index = 0;
  for (const reference of references) {
    index += 1;
    try {
      const bytes = await downloadAttachment(reference.url, credential);
      const processed = await processImageBytes(bytes, options.maxWidth);
      const fileName = buildImageFileName(workItemId, index, reference, resizing);
      const outputPath = join(options.outputDir, fileName);
      await writeFile(outputPath, processed.buffer);
      results.push({
        reference,
        path: outputPath,
        resized: processed.resized,
        format: resizing ? 'png' : reference.suggestedExtension.replace(/^\./, ''),
      });
    } catch (err: unknown) {
      results.push({
        reference,
        resized: false,
        format: reference.suggestedExtension.replace(/^\./, ''),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

/**
 * Convenience wrapper used by the commands: download the images for the given fields,
 * write the summary to stdout, and report any per-image failures to stderr. Keeps the
 * command actions thin and avoids duplicating the summary/failure handling.
 */
export async function runImageDownload(
  fields: FieldContent[],
  args: { workItemId: number; options: ImageDownloadOptions },
  credential: AuthCredential,
): Promise<void> {
  const results = await downloadImagesFromFields(fields, args, credential);
  process.stdout.write(formatImageSummary(results) + '\n');
  for (const result of results) {
    if (result.error) {
      process.stderr.write(`Failed to download image ${result.reference.url}: ${result.error}\n`);
    }
  }
}

/** Format the stdout summary line(s): count + saved paths, or a "no images found" notice. */
export function formatImageSummary(results: SavedImageResult[]): string {
  if (results.length === 0) {
    return 'Images: no images found in rich-text fields';
  }
  const saved = results.filter((r) => r.path);
  const lines = [`Images: ${saved.length} downloaded`];
  for (const result of saved) {
    lines.push(`  ${result.path}`);
  }
  return lines.join('\n');
}
