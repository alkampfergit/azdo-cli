import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createDeleteAttachmentCommand } from '../../src/commands/delete-attachment.js';
import {
  createCommandRunner,
  getStderr,
  getStdout,
  getExitCode,
  setupProcessSpies,
} from './helpers/command-test-utils.js';

vi.mock('../../src/services/azdo-client.js', () => ({
  findAttachmentRelations: vi.fn(),
  applyWorkItemPatch: vi.fn(),
}));

vi.mock('../../src/services/auth.js', () => ({
  requireAuthCredential: vi.fn(),
}));

vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(),
}));

import { findAttachmentRelations, applyWorkItemPatch } from '../../src/services/azdo-client.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createDeleteAttachmentCommand);

const singleMatch = [
  {
    index: 0,
    id: 'a1111111-1111-1111-1111-111111111111',
    name: 'screenshot.png',
    size: 102400,
    uploadedDate: '2026-08-20T10:00:00Z',
  },
];

const twoMatches = [
  {
    index: 0,
    id: 'a1111111-1111-1111-1111-111111111111',
    name: 'screenshot.png',
    size: 131072,
    uploadedDate: '2026-08-20T10:00:00Z',
  },
  {
    index: 2,
    id: 'a2222222-2222-2222-2222-222222222222',
    name: 'screenshot.png',
    size: 134144,
    uploadedDate: '2026-08-27T10:00:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveContext).mockReturnValue({ org: 'testorg', project: 'testproj' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(findAttachmentRelations).mockResolvedValue(singleMatch);
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

describe('delete-attachment command', () => {
  it('removes the matching relation with --yes and reports success', async () => {
    await run(['42', 'screenshot.png', '--yes']);

    expect(applyWorkItemPatch).toHaveBeenCalledWith(
      { org: 'testorg', project: 'testproj' },
      42,
      expect.objectContaining({ pat: 'test-pat' }),
      [{ op: 'remove', path: '/relations/0' }],
    );
    expect(getStdout()).toBe(
      'Removed "screenshot.png" (id: a1111111-1111-1111-1111-111111111111) from work item 42\n',
    );
    expect(getExitCode()).toBe(0);
  });

  it('reports a clear not-found error and makes no change', async () => {
    vi.mocked(findAttachmentRelations).mockResolvedValue([]);

    await run(['42', 'missing.png', '--yes']);

    expect(getStderr()).toContain('Attachment "missing.png" not found on work item 42');
    expect(getExitCode()).toBe(1);
    expect(applyWorkItemPatch).not.toHaveBeenCalled();
  });

  it('declines without --yes when running non-interactively (no TTY to confirm)', async () => {
    await run(['42', 'screenshot.png']);

    expect(getStderr()).toContain('confirmation required');
    expect(getExitCode()).toBe(1);
    expect(applyWorkItemPatch).not.toHaveBeenCalled();
  });

  it('lists candidates and refuses when the filename is ambiguous, even with --yes', async () => {
    vi.mocked(findAttachmentRelations).mockResolvedValue(twoMatches);

    await run(['42', 'screenshot.png', '--yes']);

    const stderr = getStderr();
    expect(stderr).toContain('multiple attachments named "screenshot.png" on work item 42');
    expect(stderr).toContain('a1111111-1111-1111-1111-111111111111');
    expect(stderr).toContain('a2222222-2222-2222-2222-222222222222');
    expect(stderr).toContain('Re-run with --id <guid> to remove a specific one.');
    expect(getExitCode()).toBe(1);
    expect(applyWorkItemPatch).not.toHaveBeenCalled();
  });

  it('removes only the matching attachment when --id disambiguates', async () => {
    vi.mocked(findAttachmentRelations).mockResolvedValue(twoMatches);

    await run(['42', 'screenshot.png', '--id', 'a2222222-2222-2222-2222-222222222222', '--yes']);

    expect(applyWorkItemPatch).toHaveBeenCalledWith(
      { org: 'testorg', project: 'testproj' },
      42,
      expect.objectContaining({ pat: 'test-pat' }),
      [{ op: 'remove', path: '/relations/2' }],
    );
    expect(getStdout()).toContain('id: a2222222-2222-2222-2222-222222222222');
    expect(getExitCode()).toBe(0);
  });

  it('reports a work-item error via handleCommandError when the lookup fails', async () => {
    vi.mocked(findAttachmentRelations).mockRejectedValue(new Error('NOT_FOUND'));

    await run(['999', 'screenshot.png', '--yes']);

    expect(getStderr()).toContain('not found');
    expect(getExitCode()).toBe(1);
  });

  it('validates --org/--project pairing', async () => {
    await run(['42', 'screenshot.png', '--org', 'onlyorg']);

    expect(getStderr()).toContain('--org and --project must both be provided');
    expect(getExitCode()).toBe(1);
    expect(findAttachmentRelations).not.toHaveBeenCalled();
  });
});
