import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommentsCommand } from '../../src/commands/comments.js';
import {
  createCommandRunner,
  describeCommandErrors,
  getExitCode,
  getStderr,
  getStdout,
  setupProcessSpies,
} from './helpers/command-test-utils.js';

vi.mock('../../src/services/azdo-client.js', () => ({
  listWorkItemComments: vi.fn(),
  addWorkItemComment: vi.fn(),
  updateWorkItemComment: vi.fn(),
  deleteWorkItemComment: vi.fn(),
}));

vi.mock('../../src/services/auth.js', () => ({
  requireAuthCredential: vi.fn(),
  describeResolvedCredential: vi.fn(() => null),
}));

vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() };
});

import { existsSync, readFileSync } from 'node:fs';
import { deleteWorkItemComment, updateWorkItemComment } from '../../src/services/azdo-client.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createCommentsCommand);

const updated = {
  workItemId: 42,
  commentId: 77,
  text: 'Edited.',
  author: 'Alice',
  createdAt: '2026-03-28T10:20:00Z',
  modifiedAt: '2026-03-28T11:00:00Z',
  url: 'https://example.test/comments/77',
};

beforeEach(() => {
  vi.clearAllMocks();
  setupProcessSpies();
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(updateWorkItemComment).mockResolvedValue(updated);
  vi.mocked(deleteWorkItemComment).mockResolvedValue({ workItemId: 42, commentId: 77, deleted: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('comments edit command', () => {
  it('prints a success message', async () => {
    await run(['edit', '42', '77', 'Edited.']);
    expect(getStdout()).toContain('Updated comment #77 on work item #42');
    expect(updateWorkItemComment).toHaveBeenCalledWith(expect.anything(), 42, 77, expect.any(Object), 'Edited.', 'html');
  });

  it('prints the JSON result with --json', async () => {
    await run(['edit', '42', '77', 'Edited.', '--json']);
    expect(JSON.parse(getStdout())).toEqual(updated);
  });

  it('passes markdown format with --markdown', async () => {
    await run(['edit', '42', '77', '**b**', '--markdown']);
    expect(updateWorkItemComment).toHaveBeenCalledWith(expect.anything(), 42, 77, expect.any(Object), '**b**', 'markdown');
  });

  it('rejects whitespace-only text before any request', async () => {
    await run(['edit', '42', '77', '   ']);
    expect(getStderr()).toContain('Comment text must be a non-empty string');
    expect(updateWorkItemComment).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('rejects an invalid comment id', async () => {
    await run(['edit', '42', 'abc', 'x']);
    expect(getStderr()).toContain('Invalid comment ID');
    expect(updateWorkItemComment).not.toHaveBeenCalled();
  });

  it('reads the text from --file, trailing newline preserved as given', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('from file\n');
    await run(['edit', '42', '77', '--file', 'note.md']);
    expect(updateWorkItemComment).toHaveBeenCalledWith(expect.anything(), 42, 77, expect.any(Object), 'from file\n', 'html');
  });

  it('reads the text from stdin with --file -', async () => {
    vi.mocked(readFileSync).mockReturnValue('piped');
    await run(['edit', '42', '77', '--file', '-']);
    expect(readFileSync).toHaveBeenCalledWith(0, 'utf-8');
    expect(updateWorkItemComment).toHaveBeenCalledWith(expect.anything(), 42, 77, expect.any(Object), 'piped', 'html');
  });

  it('rejects inline text together with --file', async () => {
    await run(['edit', '42', '77', 'inline', '--file', 'note.md']);
    expect(getStderr()).toContain('Cannot specify both inline text and --file.');
    expect(updateWorkItemComment).not.toHaveBeenCalled();
  });

  it('rejects a missing file', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await run(['edit', '42', '77', '--file', 'missing.md']);
    expect(getStderr()).toContain('File not found: missing.md');
    expect(updateWorkItemComment).not.toHaveBeenCalled();
  });

  it('rejects when neither text nor --file is given', async () => {
    await run(['edit', '42', '77']);
    expect(getStderr()).toContain('non-empty');
    expect(updateWorkItemComment).not.toHaveBeenCalled();
  });

  it('names the comment on a 404 and writes nothing to stdout', async () => {
    vi.mocked(updateWorkItemComment).mockRejectedValue(new Error('NOT_FOUND'));
    await run(['edit', '42', '77', 'x']);
    expect(getStderr()).toContain('Comment 77 not found on work item 42');
    expect(getStdout()).toBe('');
    expect(getExitCode()).toBe(1);
  });

  describeCommandErrors(vi.mocked(updateWorkItemComment), run, ['edit', '42', '77', 'x']);
});

describe('comments delete command', () => {
  it('prints a success message', async () => {
    await run(['delete', '42', '77']);
    expect(getStdout()).toContain('Deleted comment #77 from work item #42');
    expect(deleteWorkItemComment).toHaveBeenCalledWith(expect.anything(), 42, 77, expect.any(Object));
  });

  it('prints the JSON result with --json', async () => {
    await run(['delete', '42', '77', '--json']);
    expect(JSON.parse(getStdout())).toEqual({ workItemId: 42, commentId: 77, deleted: true });
  });

  it('treats an unknown or already-deleted comment as an error', async () => {
    vi.mocked(deleteWorkItemComment).mockRejectedValue(new Error('NOT_FOUND'));
    await run(['delete', '42', '77']);
    expect(getStderr()).toContain('Comment 77 not found on work item 42');
    expect(getStdout()).toBe('');
    expect(getExitCode()).toBe(1);
  });

  describeCommandErrors(vi.mocked(deleteWorkItemComment), run, ['delete', '42', '77']);
});
