import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from '../../src/program.js';
import { getStdout, setupProcessSpies } from './helpers/command-test-utils.js';

vi.mock('../../src/services/azdo-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/azdo-client.js')>();
  return { ...actual, updateWorkItemComment: vi.fn(), deleteWorkItemComment: vi.fn() };
});
vi.mock('../../src/services/auth.js', () => ({
  requireAuthCredential: vi.fn(),
  describeResolvedCredential: vi.fn(() => null),
}));
vi.mock('../../src/services/context.js', () => ({ resolveContext: vi.fn() }));

import { deleteWorkItemComment, updateWorkItemComment } from '../../src/services/azdo-client.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

// Drives `azdo comments edit|delete` through the real command tree: option
// plumbing bugs (an option stored on the wrong command) are invisible to the
// isolated-factory suites.
async function azdo(...args: string[]): Promise<void> {
  await createProgram().parseAsync(['--no-update-check', ...args], { from: 'user' });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupProcessSpies();
  vi.mocked(resolveContext).mockReturnValue({ org: 'o', project: 'p' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'x', source: 'env', kind: 'pat' });
  vi.mocked(updateWorkItemComment).mockResolvedValue({
    workItemId: 42, commentId: 77, text: 't', author: null, createdAt: null, modifiedAt: null, url: null,
  });
  vi.mocked(deleteWorkItemComment).mockResolvedValue({ workItemId: 42, commentId: 77, deleted: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('azdo comments edit|delete (real tree)', () => {
  it('edit forwards --org/--project/--markdown/--json', async () => {
    await azdo('comments', 'edit', '42', '77', '**t**', '--org', 'o', '--project', 'p', '--markdown', '--json');
    expect(resolveContext).toHaveBeenCalledWith(expect.objectContaining({ org: 'o', project: 'p' }));
    expect(updateWorkItemComment).toHaveBeenCalledWith(
      { org: 'o', project: 'p' }, 42, 77, expect.any(Object), '**t**', 'markdown',
    );
    expect(JSON.parse(getStdout())).toMatchObject({ workItemId: 42, commentId: 77 });
  });

  it('delete forwards --org/--project/--json', async () => {
    await azdo('comments', 'delete', '42', '77', '--org', 'o', '--project', 'p', '--json');
    expect(resolveContext).toHaveBeenCalledWith(expect.objectContaining({ org: 'o', project: 'p' }));
    expect(deleteWorkItemComment).toHaveBeenCalledWith({ org: 'o', project: 'p' }, 42, 77, expect.any(Object));
    expect(JSON.parse(getStdout())).toEqual({ workItemId: 42, commentId: 77, deleted: true });
  });
});
