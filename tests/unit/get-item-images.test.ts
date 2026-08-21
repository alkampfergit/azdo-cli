import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Jimp } from 'jimp';
import type { WorkItem } from '../../src/types/work-item.js';
import { createGetItemCommand } from '../../src/commands/get-item.js';
import { getStdout, getStderr, getExitCode, setupProcessSpies, createCommandRunner } from './helpers/command-test-utils.js';

vi.mock('../../src/services/azdo-client.js', () => ({
  getWorkItem: vi.fn(),
  downloadAttachment: vi.fn(),
}));
vi.mock('../../src/services/auth.js', () => ({
  requireAuthCredential: vi.fn(),
  describeResolvedCredential: vi.fn(() => null),
}));
vi.mock('../../src/services/context.js', () => ({ resolveContext: vi.fn() }));
vi.mock('../../src/services/config-store.js', () => ({
  loadConfig: vi.fn(() => ({})),
  resolveScopedConfig: vi.fn(() => ({})),
}));

import { getWorkItem, downloadAttachment } from '../../src/services/azdo-client.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createGetItemCommand);
const GUID = '12345678-1234-1234-1234-123456789abc';
const attUrl = `https://dev.azure.com/org/proj/_apis/wit/attachments/${GUID}?fileName=image.png`;

let dir: string;

function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 42,
    rev: 1,
    title: 'Test Item',
    state: 'Active',
    type: 'User Story',
    assignedTo: 'Alice',
    description: `<p>Desc</p><img src="${attUrl}">`,
    areaPath: String.raw`P\Area`,
    iterationPath: String.raw`P\Sprint 1`,
    url: 'https://dev.azure.com/org/project/_workitems/edit/42',
    extraFields: null,
    attachments: null,
    ...overrides,
  };
}

async function png(): Promise<ArrayBuffer> {
  const buf = await new Jimp({ width: 64, height: 64, color: 0x00ff00ff }).getBuffer('image/png');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

beforeEach(() => {
  vi.clearAllMocks();
  dir = mkdtempSync(join(tmpdir(), 'gi-img-'));
  vi.mocked(resolveContext).mockReturnValue({ org: 'testorg', project: 'testproj' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(getWorkItem).mockResolvedValue(makeWorkItem());
  setupProcessSpies();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('get-item image download', () => {
  it('does NOT download images without flags (opt-in)', async () => {
    await run(['42']);
    expect(downloadAttachment).not.toHaveBeenCalled();
    expect(getStdout()).not.toContain('Images:');
  });

  it('downloads embedded images with --download-images, output unchanged otherwise', async () => {
    vi.mocked(downloadAttachment).mockResolvedValue(await png());
    await run(['42', '--download-images', '--images-path', dir]);
    expect(downloadAttachment).toHaveBeenCalledTimes(1);
    const out = getStdout();
    expect(out).toContain('Title:'); // existing work-item output intact
    expect(out).toContain('Images: 1 downloaded');
  });

  it('reports "no images found" when the work item has no embedded images', async () => {
    vi.mocked(getWorkItem).mockResolvedValue(makeWorkItem({ description: '<p>no pictures here</p>' }));
    await run(['42', '--download-images', '--images-path', dir]);
    expect(downloadAttachment).not.toHaveBeenCalled();
    expect(getStdout()).toContain('no images found');
  });

  it('rejects an invalid --resize-images value and downloads nothing', async () => {
    await run(['42', '--resize-images', '0']);
    expect(getStderr()).toContain('positive integer');
    expect(getExitCode()).toBe(1);
    expect(downloadAttachment).not.toHaveBeenCalled();
  });
});
