import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Jimp } from 'jimp';
import { createGetMdFieldCommand } from '../../src/commands/get-md-field.js';
import { getStdout, getStderr, getExitCode, setupProcessSpies, createCommandRunner } from './helpers/command-test-utils.js';

vi.mock('../../src/services/azdo-client.js', () => ({
  getWorkItemFieldValue: vi.fn(),
  downloadAttachment: vi.fn(),
}));
vi.mock('../../src/services/auth.js', () => ({ requireAuthCredential: vi.fn() }));
vi.mock('../../src/services/context.js', () => ({ resolveContext: vi.fn() }));

import { getWorkItemFieldValue, downloadAttachment } from '../../src/services/azdo-client.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createGetMdFieldCommand);
const GUID = '12345678-1234-1234-1234-123456789abc';
const attUrl = `https://dev.azure.com/org/proj/_apis/wit/attachments/${GUID}?fileName=image.png`;

let dir: string;

async function png(): Promise<ArrayBuffer> {
  const buf = await new Jimp({ width: 64, height: 64, color: 0xff0000ff }).getBuffer('image/png');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

beforeEach(() => {
  vi.clearAllMocks();
  dir = mkdtempSync(join(tmpdir(), 'gmf-img-'));
  vi.mocked(resolveContext).mockReturnValue({ org: 'testorg', project: 'testproj' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(getWorkItemFieldValue).mockResolvedValue(`<p>Hello</p><img src="${attUrl}">`);
  setupProcessSpies();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('get-md-field image download', () => {
  it('does NOT download images without --download-images (opt-in)', async () => {
    await run(['42', 'System.Description']);
    expect(downloadAttachment).not.toHaveBeenCalled();
    expect(getStdout()).not.toContain('Images:');
  });

  it('downloads the field images with --download-images and still prints markdown', async () => {
    vi.mocked(downloadAttachment).mockResolvedValue(await png());
    await run(['42', 'System.Description', '--download-images', '--images-path', dir]);
    expect(downloadAttachment).toHaveBeenCalledTimes(1);
    const out = getStdout();
    expect(out).toContain('Hello'); // markdown output unchanged
    expect(out).toContain('Images: 1 downloaded');
  });

  it('--resize-images implies download', async () => {
    vi.mocked(downloadAttachment).mockResolvedValue(await png());
    await run(['42', 'System.Description', '--resize-images', '32', '--images-path', dir]);
    expect(downloadAttachment).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid --resize-images value and downloads nothing', async () => {
    await run(['42', 'System.Description', '--resize-images', 'abc']);
    expect(getStderr()).toContain('positive integer');
    expect(getExitCode()).toBe(1);
    expect(downloadAttachment).not.toHaveBeenCalled();
  });
});
