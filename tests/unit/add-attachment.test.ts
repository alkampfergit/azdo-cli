import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createAddAttachmentCommand } from '../../src/commands/add-attachment.js';
import {
  createCommandRunner,
  getStderr,
  getStdout,
  getExitCode,
  setupProcessSpies,
} from './helpers/command-test-utils.js';

vi.mock('../../src/services/azdo-client.js', () => ({
  createAttachment: vi.fn(),
  applyWorkItemPatch: vi.fn(),
}));

vi.mock('../../src/services/auth.js', () => ({
  requireAuthCredential: vi.fn(),
}));

vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { createAttachment, applyWorkItemPatch } from '../../src/services/azdo-client.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const run = createCommandRunner(createAddAttachmentCommand);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveContext).mockReturnValue({ org: 'testorg', project: 'testproj' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(statSync).mockReturnValue({ isFile: () => true } as ReturnType<typeof statSync>);
  vi.mocked(readFile).mockResolvedValue(Buffer.from('x'.repeat(1024)));
  vi.mocked(createAttachment).mockResolvedValue({
    id: 'a1111111-1111-1111-1111-111111111111',
    url: 'https://dev.azure.com/testorg/_apis/wit/attachments/a1111111-1111-1111-1111-111111111111?fileName=screenshot.png',
  });
  vi.mocked(applyWorkItemPatch).mockResolvedValue({
    id: 42,
    rev: 2,
    fields: { 'System.Title': 'Test Item' },
  });
  setupProcessSpies();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('add-attachment command', () => {
  it('uploads the file, links it, and reports name/size/id', async () => {
    await run(['42', './screenshot.png']);

    expect(createAttachment).toHaveBeenCalledWith(
      { org: 'testorg', project: 'testproj' },
      'screenshot.png',
      expect.any(Buffer),
      expect.objectContaining({ pat: 'test-pat' }),
    );
    expect(applyWorkItemPatch).toHaveBeenCalledWith(
      { org: 'testorg', project: 'testproj' },
      42,
      expect.objectContaining({ pat: 'test-pat' }),
      [
        {
          op: 'add',
          path: '/relations/-',
          value: {
            rel: 'AttachedFile',
            url: 'https://dev.azure.com/testorg/_apis/wit/attachments/a1111111-1111-1111-1111-111111111111?fileName=screenshot.png',
          },
        },
      ],
    );
    expect(getStdout()).toBe(
      'Attached "screenshot.png" (1.0 KB) to work item 42 [id: a1111111-1111-1111-1111-111111111111]\n',
    );
    expect(getExitCode()).toBe(0);
  });

  it('passes --comment through as relation attributes.comment', async () => {
    await run(['42', './screenshot.png', '--comment', 'Repro captured on staging']);

    expect(applyWorkItemPatch).toHaveBeenCalledWith(
      { org: 'testorg', project: 'testproj' },
      42,
      expect.objectContaining({ pat: 'test-pat' }),
      [
        {
          op: 'add',
          path: '/relations/-',
          value: {
            rel: 'AttachedFile',
            url: expect.any(String),
            attributes: { comment: 'Repro captured on staging' },
          },
        },
      ],
    );
  });

  it('rejects a missing local file before any network call', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await run(['42', './missing.png']);

    expect(getStderr()).toContain('File not found: ./missing.png');
    expect(getExitCode()).toBe(1);
    expect(createAttachment).not.toHaveBeenCalled();
    expect(applyWorkItemPatch).not.toHaveBeenCalled();
  });

  it('rejects a path that is a directory, not a file, before any network call', async () => {
    vi.mocked(statSync).mockReturnValue({ isFile: () => false } as ReturnType<typeof statSync>);

    await run(['42', './some-dir']);

    expect(getStderr()).toContain('is not a regular file');
    expect(getExitCode()).toBe(1);
    expect(createAttachment).not.toHaveBeenCalled();
  });

  it('reports a work-item error via handleCommandError when linking fails', async () => {
    vi.mocked(applyWorkItemPatch).mockRejectedValue(new Error('NOT_FOUND'));

    await run(['999', './screenshot.png']);

    expect(getStderr()).toContain('not found');
    expect(getExitCode()).toBe(1);
  });

  it('validates --org/--project pairing', async () => {
    await run(['42', './screenshot.png', '--org', 'onlyorg']);

    expect(getStderr()).toContain('--org and --project must both be provided');
    expect(getExitCode()).toBe(1);
    expect(createAttachment).not.toHaveBeenCalled();
  });
});
