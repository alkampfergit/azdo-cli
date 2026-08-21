import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPrCommentAddCommand,
  createPrCommentEditCommand,
  createPrCommentsAddCommand,
  createPrCommentsEditCommand,
} from '../../src/commands/pr.js';
import {
  createCommandRunner,
  getExitCode,
  getStderr,
  getStdout,
  setupProcessSpies,
} from './helpers/command-test-utils.js';

vi.mock('../../src/services/pr-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/pr-client.js')>();
  return {
    ...actual,
    listPullRequests: vi.fn(),
    getPullRequestById: vi.fn(),
    getPullRequestThread: vi.fn(),
    createPullRequestThread: vi.fn(),
    updateThreadComment: vi.fn(),
  };
});

vi.mock('../../src/services/git-remote.js', () => ({
  detectRepoName: vi.fn(),
  getCurrentBranch: vi.fn(),
}));

vi.mock('../../src/services/auth.js', () => ({
  requireAuthCredential: vi.fn(),
  describeResolvedCredential: vi.fn(() => null),
}));

vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(),
}));

import {
  createPullRequestThread,
  getPullRequestById,
  getPullRequestThread,
  listPullRequests,
  updateThreadComment,
} from '../../src/services/pr-client.js';
import { detectRepoName, getCurrentBranch } from '../../src/services/git-remote.js';
import { describeResolvedCredential, requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const runAdd = createCommandRunner(createPrCommentsAddCommand);
const runAddAlias = createCommandRunner(createPrCommentAddCommand);
const runEdit = createCommandRunner(createPrCommentsEditCommand);
const runEditAlias = createCommandRunner(createPrCommentEditCommand);

const referencePr = {
  id: 64,
  title: 'Reference PR',
  repository: 'repo-name',
  sourceRefName: 'refs/heads/feature/other',
  targetRefName: 'refs/heads/develop',
  status: 'active',
  createdBy: 'Alice',
  url: 'https://example.test/pr/64',
  description: null,
};

const existingThread = {
  id: 148,
  status: 'active',
  threadContext: null,
  line: null,
  comments: [
    { id: 3, author: 'Alice', content: 'original plan', publishedAt: null, commentType: 'text' },
    { id: 7, author: 'Bob', content: 'a reply', publishedAt: null, commentType: 'text' },
  ],
};

let tempDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  setupProcessSpies();
  tempDir = mkdtempSync(join(tmpdir(), 'azdo-pr-authoring-'));
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(detectRepoName).mockReturnValue('repo-name');
  vi.mocked(getCurrentBranch).mockReturnValue('feature/test');
  vi.mocked(listPullRequests).mockResolvedValue([referencePr]);
  vi.mocked(getPullRequestById).mockResolvedValue(referencePr);
  vi.mocked(getPullRequestThread).mockResolvedValue(existingThread);
  vi.mocked(createPullRequestThread).mockResolvedValue({
    id: 71936,
    status: 'active',
    threadContext: null,
    line: null,
    comments: [{ id: 1, author: 'Alice', content: 'posted body', publishedAt: null, commentType: 'text' }],
  });
  vi.mocked(updateThreadComment).mockImplementation(async (_ctx, _repo, _pat, _prId, _tid, commentId, content) => ({
    id: commentId,
    author: 'Alice',
    content,
    publishedAt: null,
  }));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function writeBodyFile(name: string, content: string): string {
  const path = join(tempDir, name);
  writeFileSync(path, content, 'utf-8');
  return path;
}

describe('pr comments add', () => {
  it('creates a new thread from inline text and prints the new thread id', async () => {
    await runAdd(['ClaudeCode: build is green', '--pr-number', '64']);

    expect(vi.mocked(createPullRequestThread)).toHaveBeenCalledWith(
      expect.any(Object),
      'repo-name',
      expect.objectContaining({ pat: 'test-pat' }),
      64,
      'ClaudeCode: build is green',
      undefined,
    );
    expect(getStdout()).toContain('Comment posted to pull request #64 (thread #71936).');
    expect(getExitCode()).toBe(0);
  });

  it('reads the body from --file, trimming the trailing newline', async () => {
    const file = writeBodyFile('plan.md', '# Plan\n\nStep one.\n');

    await runAdd(['--file', file, '--pr-number', '64']);

    expect(vi.mocked(createPullRequestThread)).toHaveBeenCalledWith(
      expect.any(Object),
      'repo-name',
      expect.any(Object),
      64,
      '# Plan\n\nStep one.',
      undefined,
    );
  });

  it('passes a validated --status through to the API', async () => {
    await runAdd(['body', '--pr-number', '64', '--status', 'active']);

    expect(vi.mocked(createPullRequestThread)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 64, 'body', 'active',
    );
  });

  it('rejects an unknown --status before any network call', async () => {
    await runAdd(['body', '--pr-number', '64', '--status', 'resolved']);

    expect(vi.mocked(createPullRequestThread)).not.toHaveBeenCalled();
    expect(getStderr()).toContain('Invalid --status "resolved"');
    expect(getExitCode()).toBe(1);
  });

  it('rejects inline text and --file together', async () => {
    const file = writeBodyFile('plan.md', 'body');

    await runAdd(['inline', '--file', file, '--pr-number', '64']);

    expect(vi.mocked(createPullRequestThread)).not.toHaveBeenCalled();
    expect(getStderr()).toContain('Cannot specify both inline text and --file.');
    expect(getExitCode()).toBe(1);
  });

  it('rejects a missing body', async () => {
    await runAdd(['--pr-number', '64']);

    expect(getStderr()).toContain('Comment text must not be empty.');
    expect(getExitCode()).toBe(1);
  });

  it('rejects a whitespace-only file body', async () => {
    const file = writeBodyFile('empty.md', '   \n\n');

    await runAdd(['--file', file, '--pr-number', '64']);

    expect(vi.mocked(createPullRequestThread)).not.toHaveBeenCalled();
    expect(getStderr()).toContain('Comment text must not be empty.');
    expect(getExitCode()).toBe(1);
  });

  it('rejects a missing file', async () => {
    await runAdd(['--file', join(tempDir, 'nope.md'), '--pr-number', '64']);

    expect(getStderr()).toContain('File not found:');
    expect(getExitCode()).toBe(1);
  });

  it('--dry-run prints the body and never posts', async () => {
    await runAdd(['a body', '--pr-number', '64', '--dry-run']);

    expect(vi.mocked(createPullRequestThread)).not.toHaveBeenCalled();
    expect(getStdout()).toContain('Dry run: would post a new comment thread on pull request #64');
    expect(getStdout()).toContain('a body');
    expect(getExitCode()).toBe(0);
  });

  it('--dry-run --json reports null ids and dryRun true', async () => {
    await runAdd(['a body', '--pr-number', '64', '--dry-run', '--json', '--status', 'pending']);

    expect(JSON.parse(getStdout())).toEqual({
      pullRequestId: 64,
      threadId: null,
      commentId: null,
      status: 'pending',
      content: 'a body',
      dryRun: true,
    });
    expect(vi.mocked(createPullRequestThread)).not.toHaveBeenCalled();
  });

  it('--json emits the created thread and comment ids', async () => {
    await runAdd(['posted body', '--pr-number', '64', '--json']);

    expect(JSON.parse(getStdout())).toEqual({
      pullRequestId: 64,
      threadId: 71936,
      commentId: 1,
      status: 'active',
      content: 'posted body',
      dryRun: false,
    });
  });

  it('auto-detects the branch PR when --pr-number is absent', async () => {
    await runAdd(['body']);

    expect(vi.mocked(listPullRequests)).toHaveBeenCalled();
    expect(vi.mocked(createPullRequestThread)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 64, 'body', undefined,
    );
  });

  it('fails cleanly when no open PR matches the branch', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([]);

    await runAdd(['body']);

    expect(getStderr()).toContain('No open pull request matches branch feature/test.');
    expect(getExitCode()).toBe(1);
  });

  it('honours --repo instead of the origin remote', async () => {
    await runAdd(['body', '--pr-number', '64', '--repo', 'other-repo']);

    expect(vi.mocked(detectRepoName)).not.toHaveBeenCalled();
    expect(vi.mocked(createPullRequestThread)).toHaveBeenCalledWith(
      expect.any(Object), 'other-repo', expect.any(Object), 64, 'body', undefined,
    );
  });

  it('maps a write auth failure to the Read & Write scope hint', async () => {
    vi.mocked(createPullRequestThread).mockRejectedValue(new Error('AUTH_FAILED'));

    await runAdd(['body', '--pr-number', '64']);

    expect(getStderr()).toContain('Code (Read & Write)');
    // 4 = not permitted (auth / permission), distinct from 3 = not found.
    expect(getExitCode()).toBe(4);
  });

  it('names the token source under the scope hint, so the failure is actionable', async () => {
    vi.mocked(createPullRequestThread).mockRejectedValue(new Error('AUTH_FAILED'));
    vi.mocked(describeResolvedCredential).mockReturnValue('Token used: PAT from the AZDO_PAT environment variable.');

    await runAdd(['body', '--pr-number', '64']);

    const stderr = getStderr();
    // First line unchanged from previous releases; the source line is additive.
    expect(stderr).toContain('Authentication failed. Check that your PAT is valid and has the "Code (Read & Write)" scope.');
    expect(stderr).toContain('Token used: PAT from the AZDO_PAT environment variable.');
  });

  it('the comment-add alias behaves identically', async () => {
    await runAddAlias(['body', '--pr-number', '64']);

    expect(vi.mocked(createPullRequestThread)).toHaveBeenCalled();
    expect(getStdout()).toContain('Comment posted to pull request #64 (thread #71936).');
  });
});

describe('pr comments edit', () => {
  it('edits the thread\'s first comment by default', async () => {
    await runEdit(['148', 'corrected text', '--pr-number', '64']);

    expect(vi.mocked(updateThreadComment)).toHaveBeenCalledWith(
      expect.any(Object),
      'repo-name',
      expect.objectContaining({ pat: 'test-pat' }),
      64,
      148,
      3,
      'corrected text',
    );
    expect(getStdout()).toContain('Comment #3 updated in thread #148 on pull request #64.');
    expect(getExitCode()).toBe(0);
  });

  it('targets a specific comment with --comment-id', async () => {
    await runEdit(['148', 'corrected text', '--pr-number', '64', '--comment-id', '7']);

    expect(vi.mocked(updateThreadComment)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 64, 148, 7, 'corrected text',
    );
  });

  it('rejects an invalid --comment-id before any network call', async () => {
    await runEdit(['148', 'text', '--pr-number', '64', '--comment-id', 'abc']);

    expect(vi.mocked(getPullRequestThread)).not.toHaveBeenCalled();
    expect(getStderr()).toContain('Invalid --comment-id "abc"');
    expect(getExitCode()).toBe(1);
  });

  it('reports a comment id that is not in the thread', async () => {
    await runEdit(['148', 'text', '--pr-number', '64', '--comment-id', '999']);

    expect(vi.mocked(updateThreadComment)).not.toHaveBeenCalled();
    expect(getStderr()).toContain('Comment #999 not found in thread #148 on pull request #64.');
    expect(getExitCode()).toBe(3);
  });

  it('reports a thread that does not exist on the PR', async () => {
    vi.mocked(getPullRequestThread).mockRejectedValue(new Error('NOT_FOUND: thread'));

    await runEdit(['999', 'text', '--pr-number', '64']);

    expect(getStderr()).toContain('Thread #999 not found on pull request #64.');
    expect(getExitCode()).toBe(3);
  });

  it('rejects an invalid thread id before any network call', async () => {
    await runEdit(['abc', 'text', '--pr-number', '64']);

    expect(vi.mocked(getPullRequestThread)).not.toHaveBeenCalled();
    expect(getStderr()).toContain('Invalid thread id "abc"');
    expect(getExitCode()).toBe(1);
  });

  it('reads the replacement body from --file', async () => {
    const file = writeBodyFile('plan-v2.md', '# Plan v2\n');

    await runEdit(['148', '--file', file, '--pr-number', '64']);

    expect(vi.mocked(updateThreadComment)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 64, 148, 3, '# Plan v2',
    );
  });

  it('--dry-run shows the replacement without writing', async () => {
    await runEdit(['148', 'new body', '--pr-number', '64', '--dry-run']);

    expect(vi.mocked(updateThreadComment)).not.toHaveBeenCalled();
    expect(getStdout()).toContain(
      'Dry run: would replace comment #3 in thread #148 on pull request #64 (13 chars -> 8 chars).',
    );
    expect(getExitCode()).toBe(0);
  });

  it('--json reports the previous and new content', async () => {
    await runEdit(['148', 'new body', '--pr-number', '64', '--json']);

    expect(JSON.parse(getStdout())).toEqual({
      pullRequestId: 64,
      threadId: 148,
      commentId: 3,
      previousContent: 'original plan',
      content: 'new body',
      dryRun: false,
    });
  });

  it('maps a 403 from Azure DevOps to a permission error', async () => {
    vi.mocked(updateThreadComment).mockRejectedValue(new Error('PERMISSION_DENIED'));

    await runEdit(['148', 'new body', '--pr-number', '64']);

    expect(getStderr()).toContain('Access denied.');
    expect(getExitCode()).toBe(4);
  });

  it('the comment-edit alias behaves identically', async () => {
    await runEditAlias(['148', 'corrected text', '--pr-number', '64']);

    expect(vi.mocked(updateThreadComment)).toHaveBeenCalled();
    expect(getStdout()).toContain('Comment #3 updated in thread #148 on pull request #64.');
  });
});
