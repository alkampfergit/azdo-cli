import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createDeleteItemCommand } from '../../src/commands/delete-item.js';
import {
  createCommandRunner,
  getStderr,
  getStdout,
  getExitCode,
  setupProcessSpies,
} from './helpers/command-test-utils.js';

vi.mock('../../src/services/azdo-client.js', () => ({
  deleteWorkItem: vi.fn(),
}));
vi.mock('../../src/services/auth.js', () => ({
  requireAuthCredential: vi.fn(),
}));
vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(),
}));

import { deleteWorkItem } from '../../src/services/azdo-client.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createDeleteItemCommand);
const ctx = { org: 'testorg', project: 'testproj' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveContext).mockReturnValue(ctx);
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(deleteWorkItem).mockResolvedValue({ id: 42, permanent: false });
  setupProcessSpies();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('delete-item command', () => {
  it('moves the work item to the Recycle Bin with --yes', async () => {
    await run(['42', '--yes']);

    expect(deleteWorkItem).toHaveBeenCalledWith(ctx, 42, expect.objectContaining({ pat: 'test-pat' }), false);
    expect(getStdout()).toBe('Deleted work item 42\n');
    expect(getExitCode()).toBe(0);
  });

  it('destroys permanently with --permanent', async () => {
    vi.mocked(deleteWorkItem).mockResolvedValue({ id: 42, permanent: true });

    await run(['42', '--yes', '--permanent']);

    expect(deleteWorkItem).toHaveBeenCalledWith(ctx, 42, expect.anything(), true);
    expect(getStdout()).toBe('Permanently deleted work item 42\n');
  });

  it('prints JSON with --json', async () => {
    await run(['42', '--yes', '--json']);

    expect(JSON.parse(getStdout())).toEqual({ id: 42, permanent: false, deleted: true });
  });

  it('refuses without --yes in a non-interactive shell and deletes nothing', async () => {
    await run(['42']);

    expect(getStderr()).toContain('confirmation required');
    expect(getExitCode()).toBe(1);
    expect(deleteWorkItem).not.toHaveBeenCalled();
  });

  it('reports a not-found error', async () => {
    vi.mocked(deleteWorkItem).mockRejectedValue(new Error('NOT_FOUND'));

    await run(['42', '--yes']);

    expect(getStderr()).toContain('Work item 42 not found in testorg/testproj');
    expect(getExitCode()).toBe(1);
  });
});
