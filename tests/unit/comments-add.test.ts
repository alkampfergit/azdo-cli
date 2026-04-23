import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommentsCommand } from '../../src/commands/comments.js';
import {
  createCommandRunner,
  describeCommandErrors,
  getStderr,
  getStdout,
  setupProcessSpies,
} from './helpers/command-test-utils.js';

vi.mock('../../src/services/azdo-client.js', () => ({
  listWorkItemComments: vi.fn(),
  addWorkItemComment: vi.fn(),
}));

vi.mock('../../src/services/auth.js', () => ({
  requirePat: vi.fn(),
}));

vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(),
}));

import { addWorkItemComment } from '../../src/services/azdo-client.js';
import { requirePat } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createCommentsCommand);

beforeEach(() => {
  setupProcessSpies();
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(requirePat).mockResolvedValue({ pat: 'test-pat', source: 'env' });
  vi.mocked(addWorkItemComment).mockResolvedValue({
    workItemId: 42,
    commentId: 77,
    text: 'Queued validation run.',
    author: 'Alice',
    createdAt: '2026-03-28T10:20:00Z',
    url: 'https://example.test/comments/77',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('comments add command', () => {
  it('rejects whitespace-only comment text before any write occurs', async () => {
    await run(['add', '42', '   ']);
    expect(getStderr()).toContain('Comment text must be a non-empty string.');
    expect(addWorkItemComment).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('prints a success message when a comment is created', async () => {
    await run(['add', '42', 'Queued validation run.']);
    expect(getStdout()).toContain('Added comment #77 to work item #42');
  });

  it('prints JSON output with --json', async () => {
    await run(['add', '42', 'Queued validation run.', '--json']);

    expect(JSON.parse(getStdout())).toEqual({
      workItemId: 42,
      commentId: 77,
      text: 'Queued validation run.',
      author: 'Alice',
      createdAt: '2026-03-28T10:20:00Z',
      url: 'https://example.test/comments/77',
    });
  });

  it('calls addWorkItemComment with format markdown when --markdown is passed', async () => {
    await run(['add', '42', '**bold**', '--markdown']);
    expect(addWorkItemComment).toHaveBeenCalledWith(
      expect.anything(),
      42,
      expect.any(String),
      '**bold**',
      'markdown',
    );
  });

  it('calls addWorkItemComment with format html when --markdown is absent', async () => {
    await run(['add', '42', 'plain text']);
    expect(addWorkItemComment).toHaveBeenCalledWith(
      expect.anything(),
      42,
      expect.any(String),
      'plain text',
      'html',
    );
  });

  describeCommandErrors(
    vi.mocked(addWorkItemComment),
    run,
    ['add', '42', 'Queued validation run.'],
  );
});
