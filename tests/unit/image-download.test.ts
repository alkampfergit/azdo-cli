import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Jimp } from 'jimp';

vi.mock('../../src/services/azdo-client.js', () => ({
  downloadAttachment: vi.fn(),
}));

import { downloadAttachment } from '../../src/services/azdo-client.js';
import {
  extractImageReferences,
  resolveImageDownloadOptions,
  buildImageFileName,
  downloadImagesFromFields,
  formatImageSummary,
  type EmbeddedImageReference,
} from '../../src/services/image-download.js';

const GUID_A = '12345678-1234-1234-1234-123456789abc';
const GUID_B = 'abcdef00-0000-0000-0000-000000000001';
const attUrl = (guid: string, fileName = 'image.png'): string =>
  `https://dev.azure.com/org/proj/_apis/wit/attachments/${guid}?fileName=${fileName}`;

const credential = { pat: 'x', source: 'env' as const, kind: 'pat' as const };

async function pngBytes(width: number, height: number): Promise<ArrayBuffer> {
  const img = new Jimp({ width, height, color: 0xff0000ff });
  const buf = await img.getBuffer('image/png');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('extractImageReferences', () => {
  it('extracts an ADO attachment from an HTML <img> tag', () => {
    const refs = extractImageReferences(`<p><img src="${attUrl(GUID_A)}"></p>`, 'Description');
    expect(refs).toHaveLength(1);
    expect(refs[0].guid).toBe(GUID_A);
    expect(refs[0].suggestedExtension).toBe('.png');
    expect(refs[0].sourceField).toBe('Description');
  });

  it('extracts an ADO attachment from Markdown image syntax', () => {
    const refs = extractImageReferences(`![shot](${attUrl(GUID_A, 'pic.jpg')})`, 'Description');
    expect(refs).toHaveLength(1);
    expect(refs[0].guid).toBe(GUID_A);
    expect(refs[0].suggestedExtension).toBe('.jpg');
  });

  it('ignores non-Azure-DevOps (external) image URLs', () => {
    const html = `<img src="https://example.com/cat.png"> ![x](https://imgur.com/y.png)`;
    expect(extractImageReferences(html, 'Description')).toHaveLength(0);
  });

  it('rejects a non-Azure-DevOps host even when the path mimics the attachment endpoint (credential-exfil guard)', () => {
    const evil = `https://evil.example/_apis/wit/attachments/${GUID_A}?fileName=x.png`;
    expect(extractImageReferences(`<img src="${evil}">`, 'Description')).toHaveLength(0);
    expect(extractImageReferences(`![x](${evil})`, 'Description')).toHaveLength(0);
  });

  it('accepts the legacy *.visualstudio.com attachment host', () => {
    const url = `https://myorg.visualstudio.com/proj/_apis/wit/attachments/${GUID_A}?fileName=a.png`;
    expect(extractImageReferences(`<img src="${url}">`, 'Description')).toHaveLength(1);
  });

  it('rejects a non-https (http) attachment URL', () => {
    const url = `http://dev.azure.com/org/_apis/wit/attachments/${GUID_A}?fileName=a.png`;
    expect(extractImageReferences(`<img src="${url}">`, 'Description')).toHaveLength(0);
  });

  it('ignores non-image markdown links', () => {
    const md = `[a document](${attUrl(GUID_A, 'doc.pdf')})`;
    expect(extractImageReferences(md, 'Description')).toHaveLength(0);
  });

  it('de-duplicates by GUID across <img> and ![]() forms', () => {
    const mixed = `<img src="${attUrl(GUID_A)}"> and ![again](${attUrl(GUID_A)})`;
    expect(extractImageReferences(mixed, 'Description')).toHaveLength(1);
  });

  it('decodes HTML entities in the src attribute', () => {
    const url = `${attUrl(GUID_A)}&amp;download=true`;
    const refs = extractImageReferences(`<img src="${url}">`, 'Description');
    expect(refs[0].url).toContain('&download=true');
    expect(refs[0].url).not.toContain('&amp;');
  });

  it('returns empty for empty content', () => {
    expect(extractImageReferences('', 'Description')).toHaveLength(0);
  });
});

describe('resolveImageDownloadOptions', () => {
  it('is disabled with no flags', () => {
    expect(resolveImageDownloadOptions({}).enabled).toBe(false);
  });

  it('is enabled by --download-images', () => {
    expect(resolveImageDownloadOptions({ downloadImages: true }).enabled).toBe(true);
  });

  it('is enabled by --resize-images alone (implies download)', () => {
    const opts = resolveImageDownloadOptions({ resizeImages: '1024' });
    expect(opts.enabled).toBe(true);
    expect(opts.maxWidth).toBe(1024);
  });

  it('defaults outputDir to the system temp dir', () => {
    expect(resolveImageDownloadOptions({ downloadImages: true }).outputDir).toBe(tmpdir());
  });

  it.each(['0', '-5', 'abc', '12.5'])('rejects invalid --resize-images value %s', (value) => {
    expect(() => resolveImageDownloadOptions({ resizeImages: value })).toThrow(/positive integer/);
  });

  it('throws when --images-path does not exist', () => {
    expect(() => resolveImageDownloadOptions({ downloadImages: true, imagesPath: '/no/such/dir/xyz' })).toThrow(/does not exist/);
  });
});

describe('buildImageFileName', () => {
  const ref: EmbeddedImageReference = { url: 'u', sourceField: 'Description', guid: GUID_A, suggestedExtension: '.jpg' };

  it('uses the original extension when not resizing', () => {
    expect(buildImageFileName(41748, 1, ref, false)).toBe('wi-41748-1.jpg');
  });

  it('forces .png when resizing', () => {
    expect(buildImageFileName(41748, 2, ref, true)).toBe('wi-41748-2.png');
  });
});

describe('downloadImagesFromFields', () => {
  let dir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), 'img-dl-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('downloads at original size when not resizing', async () => {
    vi.mocked(downloadAttachment).mockResolvedValue(await pngBytes(2000, 1000));
    const results = await downloadImagesFromFields(
      [{ content: `<img src="${attUrl(GUID_A)}">`, field: 'Description' }],
      { workItemId: 41748, options: { enabled: true, outputDir: dir } },
      credential,
    );
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(join(dir, 'wi-41748-1.png'));
    expect(results[0].resized).toBe(false);
    expect(existsSync(results[0].path!)).toBe(true);
  });

  it('resizes to the max width (aspect preserved) and saves PNG', async () => {
    vi.mocked(downloadAttachment).mockResolvedValue(await pngBytes(2000, 1000));
    const results = await downloadImagesFromFields(
      [{ content: `<img src="${attUrl(GUID_A)}">`, field: 'Description' }],
      { workItemId: 41748, options: { enabled: true, maxWidth: 500, outputDir: dir } },
      credential,
    );
    expect(results[0].resized).toBe(true);
    expect(results[0].format).toBe('png');
    const saved = await Jimp.read(readFileSync(results[0].path!));
    expect(saved.bitmap.width).toBe(500);
    expect(saved.bitmap.height).toBe(250);
  });

  it('does not upscale images already narrower than the max width', async () => {
    vi.mocked(downloadAttachment).mockResolvedValue(await pngBytes(300, 150));
    const results = await downloadImagesFromFields(
      [{ content: `<img src="${attUrl(GUID_A)}">`, field: 'Description' }],
      { workItemId: 1, options: { enabled: true, maxWidth: 1024, outputDir: dir } },
      credential,
    );
    expect(results[0].resized).toBe(false);
    const saved = await Jimp.read(readFileSync(results[0].path!));
    expect(saved.bitmap.width).toBe(300);
  });

  it('de-duplicates across fields and downloads each image once', async () => {
    vi.mocked(downloadAttachment).mockResolvedValue(await pngBytes(100, 100));
    const results = await downloadImagesFromFields(
      [
        { content: `<img src="${attUrl(GUID_A)}">`, field: 'Description' },
        { content: `![dup](${attUrl(GUID_A)}) and ![b](${attUrl(GUID_B)})`, field: 'Repro Steps' },
      ],
      { workItemId: 7, options: { enabled: true, outputDir: dir } },
      credential,
    );
    expect(results).toHaveLength(2);
    expect(downloadAttachment).toHaveBeenCalledTimes(2);
  });

  it('continues on a per-image failure (partial success)', async () => {
    vi.mocked(downloadAttachment)
      .mockResolvedValueOnce(await pngBytes(100, 100))
      .mockRejectedValueOnce(new Error('HTTP_404'));
    const results = await downloadImagesFromFields(
      [{ content: `![a](${attUrl(GUID_A)}) ![b](${attUrl(GUID_B)})`, field: 'Description' }],
      { workItemId: 7, options: { enabled: true, outputDir: dir } },
      credential,
    );
    expect(results).toHaveLength(2);
    expect(results.filter((r) => r.path)).toHaveLength(1);
    expect(results.find((r) => r.error)?.error).toContain('HTTP_404');
  });
});

describe('formatImageSummary', () => {
  it('reports "no images found" for an empty result set', () => {
    expect(formatImageSummary([])).toContain('no images found');
  });

  it('reports the count and saved paths', () => {
    const savedPath = join('output', 'wi-1-1.png');
    const summary = formatImageSummary([
      { reference: { url: 'u', sourceField: 'd', guid: GUID_A, suggestedExtension: '.png' }, path: savedPath, resized: false, format: 'png' },
    ]);
    expect(summary).toContain('Images: 1 downloaded');
    expect(summary).toContain(savedPath);
  });
});
