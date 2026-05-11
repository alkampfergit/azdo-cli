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
  requireAuthCredential: vi.fn(),
}));

vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(),
}));

import { listWorkItemComments } from '../../src/services/azdo-client.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createCommentsCommand);

beforeEach(() => {
  setupProcessSpies();
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
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

  describe('--markdown flag', () => {
    it('converts HTML comment bodies to markdown when --markdown is passed', async () => {
      vi.mocked(listWorkItemComments).mockResolvedValue({
        workItemId: 42,
        count: 1,
        comments: [
          {
            id: 51,
            workItemId: 42,
            text: '<p><strong>Hello</strong> world</p>',
            author: 'Alice',
            createdAt: '2026-03-28T10:15:00Z',
            modifiedAt: '2026-03-28T10:15:00Z',
            isDeleted: false,
          },
        ],
      });

      await run(['list', '42', '--markdown']);

      const output = getStdout();
      expect(output).not.toContain('<p>');
      expect(output).not.toContain('<strong>');
      expect(output).toContain('Hello');
    });

    it('passes through non-HTML comment bodies unchanged when --markdown is passed', async () => {
      vi.mocked(listWorkItemComments).mockResolvedValue({
        workItemId: 42,
        count: 1,
        comments: [
          {
            id: 52,
            workItemId: 42,
            text: '**plain markdown** text',
            author: 'Bob',
            createdAt: '2026-03-29T08:00:00Z',
            modifiedAt: '2026-03-29T08:00:00Z',
            isDeleted: false,
          },
        ],
      });

      await run(['list', '42', '--markdown']);

      expect(getStdout()).toContain('**plain markdown** text');
    });

    it('does not convert when --markdown is absent', async () => {
      vi.mocked(listWorkItemComments).mockResolvedValue({
        workItemId: 42,
        count: 1,
        comments: [
          {
            id: 53,
            workItemId: 42,
            text: '<p>raw html</p>',
            author: 'Carol',
            createdAt: '2026-03-29T09:00:00Z',
            modifiedAt: '2026-03-29T09:00:00Z',
            isDeleted: false,
          },
        ],
      });

      await run(['list', '42']);

      expect(getStdout()).toContain('<p>raw html</p>');
    });

    it('does not convert text in JSON output even when --markdown is passed', async () => {
      vi.mocked(listWorkItemComments).mockResolvedValue({
        workItemId: 42,
        count: 1,
        comments: [
          {
            id: 54,
            workItemId: 42,
            text: '<p>html comment</p>',
            author: 'Dave',
            createdAt: '2026-03-29T10:00:00Z',
            modifiedAt: '2026-03-29T10:00:00Z',
            isDeleted: false,
          },
        ],
      });

      await run(['list', '42', '--markdown', '--json']);

      const parsed = JSON.parse(getStdout()) as { comments: Array<{ text: string }> };
      expect(parsed.comments[0].text).toBe('<p>html comment</p>');
    });
  });

  describeCommandErrors(
    vi.mocked(listWorkItemComments),
    run,
    ['list', '42'],
  );
});
