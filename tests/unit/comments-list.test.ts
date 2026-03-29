import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommentsCommand } from '../../src/commands/comments.js';
import {
  createCommandRunner,
  describeCommandErrors,
  getStdout,
  setupProcessSpies,
} from './helpers/command-test-utils.js';

vi.mock('../../src/services/azdo-client.js', () => ({
  listWorkItemComments: vi.fn(),
  addWorkItemComment: vi.fn(),
}));

vi.mock('../../src/services/auth.js', () => ({
  resolvePat: vi.fn(),
}));

vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(),
}));

import { listWorkItemComments } from '../../src/services/azdo-client.js';
import { resolvePat } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createCommentsCommand);

beforeEach(() => {
  setupProcessSpies();
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(resolvePat).mockResolvedValue({ pat: 'test-pat', source: 'env' });
  vi.mocked(listWorkItemComments).mockResolvedValue({
    workItemId: 42,
    count: 0,
    comments: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('comments list command', () => {
  it('prints an empty-state message when a work item has no comments', async () => {
    await run(['list', '42']);
    expect(getStdout()).toContain('Work item #42 has no comments.');
  });

  it('prints newest-first comment blocks for visible comments', async () => {
    vi.mocked(listWorkItemComments).mockResolvedValue({
      workItemId: 42,
      count: 2,
      comments: [
        {
          id: 51,
          workItemId: 42,
          text: 'Newest visible comment',
          author: 'Alice',
          createdAt: '2026-03-28T10:15:00Z',
          modifiedAt: '2026-03-28T10:15:00Z',
          isDeleted: false,
        },
        {
          id: 49,
          workItemId: 42,
          text: 'Older visible comment',
          author: null,
          createdAt: '2026-03-27T19:02:11Z',
          modifiedAt: '2026-03-27T19:02:11Z',
          isDeleted: false,
        },
      ],
    });

    await run(['list', '42']);

    const output = getStdout();
    expect(output).toContain('Comments for work item #42');
    expect(output).toContain('Comment #51 by Alice at 2026-03-28T10:15:00Z');
    expect(output).toContain('Newest visible comment');
    expect(output).toContain('Comment #49 by Unknown at 2026-03-27T19:02:11Z');
    expect(output).toContain('Older visible comment');
  });

  it('prints JSON output with --json', async () => {
    vi.mocked(listWorkItemComments).mockResolvedValue({
      workItemId: 42,
      count: 1,
      comments: [
        {
          id: 51,
          workItemId: 42,
          text: 'Newest visible comment',
          author: 'Alice',
          createdAt: '2026-03-28T10:15:00Z',
          modifiedAt: '2026-03-28T10:15:00Z',
          isDeleted: false,
        },
      ],
    });

    await run(['list', '42', '--json']);

    expect(JSON.parse(getStdout())).toEqual({
      workItemId: 42,
      count: 1,
      comments: [
        {
          id: 51,
          workItemId: 42,
          text: 'Newest visible comment',
          author: 'Alice',
          createdAt: '2026-03-28T10:15:00Z',
          modifiedAt: '2026-03-28T10:15:00Z',
          isDeleted: false,
        },
      ],
    });
  });

  describeCommandErrors(
    vi.mocked(listWorkItemComments),
    run,
    ['list', '42'],
  );
});
