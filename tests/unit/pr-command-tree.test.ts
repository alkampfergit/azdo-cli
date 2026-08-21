import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { createPrCommand } from '../../src/commands/pr.js';
import { getExitCode, getStdout, setupProcessSpies } from './helpers/command-test-utils.js';

vi.mock('../../src/services/pr-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/pr-client.js')>();
  return {
    ...actual,
    listPullRequests: vi.fn(),
    getPullRequestById: vi.fn(),
    getPullRequestThread: vi.fn(),
    getPullRequestThreads: vi.fn(),
    createPullRequestThread: vi.fn(),
    updateThreadComment: vi.fn(),
    postThreadComment: vi.fn(),
    linkWorkItemToPullRequest: vi.fn(),
    unlinkWorkItemFromPullRequest: vi.fn(),
    resolveReviewerIdentity: vi.fn(),
    addOrUpdatePullRequestReviewer: vi.fn(),
    removePullRequestReviewer: vi.fn(),
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
vi.mock('../../src/services/context.js', () => ({ resolveContext: vi.fn() }));

import {
  createPullRequestThread,
  getPullRequestById,
  getPullRequestThread,
  getPullRequestThreads,
  listPullRequests,
  postThreadComment,
  updateThreadComment,
  linkWorkItemToPullRequest,
  unlinkWorkItemFromPullRequest,
  resolveReviewerIdentity,
  addOrUpdatePullRequestReviewer,
  removePullRequestReviewer,
} from '../../src/services/pr-client.js';
import { detectRepoName, getCurrentBranch } from '../../src/services/git-remote.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

// The whole point of this suite: drive the commands the way a user does, through
// `azdo pr …`, instead of through the exported factory in isolation. Options
// declared on BOTH `pr comments` and its subcommands (--org/--project/--repo/
// --pr-number/--json) are stored on the parent, so only a full-tree invocation
// catches them going missing.
function runTree(argv: string[]): Promise<Command> {
  const program = new Command().name('azdo');
  program.addCommand(createPrCommand());
  return program.parseAsync(argv, { from: 'user' });
}

const branchPr = {
  id: 12,
  title: 'Branch PR',
  repository: 'repo-name',
  sourceRefName: 'refs/heads/feature/test',
  targetRefName: 'refs/heads/develop',
  status: 'active',
  createdBy: 'Alice',
  url: 'https://example.test/pr/12',
  description: null,
};
const explicitPr = { ...branchPr, id: 4804, title: 'Explicit PR', url: 'https://example.test/pr/4804' };

beforeEach(() => {
  vi.clearAllMocks();
  setupProcessSpies();
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(detectRepoName).mockReturnValue('repo-name');
  vi.mocked(getCurrentBranch).mockReturnValue('feature/test');
  vi.mocked(listPullRequests).mockResolvedValue([branchPr]);
  vi.mocked(getPullRequestById).mockResolvedValue(explicitPr);
  vi.mocked(getPullRequestThreads).mockResolvedValue([
    { id: 148, status: 'active', threadContext: null, line: null, comments: [{ id: 3, author: 'Alice', content: 'body', publishedAt: null, commentType: 'text' }] },
  ]);
  vi.mocked(getPullRequestThread).mockResolvedValue({
    id: 148, status: 'active', threadContext: null, line: null,
    comments: [{ id: 3, author: 'Alice', content: 'original', publishedAt: null, commentType: 'text' }],
  });
  vi.mocked(createPullRequestThread).mockResolvedValue({
    id: 71936, status: 'active', threadContext: null, line: null,
    comments: [{ id: 1, author: 'Alice', content: 'posted', publishedAt: null, commentType: 'text' }],
  });
  vi.mocked(updateThreadComment).mockResolvedValue({ id: 3, author: 'Alice', content: 'new', publishedAt: null });
  vi.mocked(postThreadComment).mockResolvedValue({ id: 9, author: 'Alice', content: 'reply', publishedAt: null });
  vi.mocked(linkWorkItemToPullRequest).mockResolvedValue({ pullRequestId: 4804, workItemId: 1234, url: 'vstfs:///Git/PullRequestId/p/r/4804', noop: false });
  vi.mocked(unlinkWorkItemFromPullRequest).mockResolvedValue({ pullRequestId: 4804, workItemId: 1234, url: 'vstfs:///Git/PullRequestId/p/r/4804', noop: false });
  vi.mocked(resolveReviewerIdentity).mockResolvedValue({ id: 'identity-guid', providerDisplayName: 'Jane Reviewer' });
  vi.mocked(addOrUpdatePullRequestReviewer).mockResolvedValue({ id: 'identity-guid', displayName: 'Jane Reviewer', uniqueName: 'jane@example.com', isRequired: false, vote: 0 });
  vi.mocked(removePullRequestReviewer).mockResolvedValue({ reviewer: { id: 'identity-guid', displayName: 'Jane Reviewer', uniqueName: 'jane@example.com', isRequired: false, vote: 0 }, noop: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pr comments add — nested vs alias option plumbing', () => {
  it.each([
    ['nested', ['pr', 'comments', 'add', 'text', '--pr-number', '4804', '--dry-run', '--json']],
    ['alias', ['pr', 'comment-add', 'text', '--pr-number', '4804', '--dry-run', '--json']],
  ])('%s form honours --pr-number and --json', async (_form, argv) => {
    await runTree(argv);

    expect(vi.mocked(getPullRequestById)).toHaveBeenCalledWith(expect.any(Object), 'repo-name', expect.any(Object), 4804);
    expect(vi.mocked(listPullRequests)).not.toHaveBeenCalled();
    expect(JSON.parse(getStdout())).toEqual({
      pullRequestId: 4804,
      threadId: null,
      commentId: null,
      status: null,
      content: 'text',
      dryRun: true,
    });
    expect(getExitCode()).toBe(0);
  });

  it.each([
    ['nested', ['pr', 'comments', 'add', 'text', '--pr-number', '4804', '--repo', 'other-repo', '--json']],
    ['alias', ['pr', 'comment-add', 'text', '--pr-number', '4804', '--repo', 'other-repo', '--json']],
  ])('%s form honours --repo', async (_form, argv) => {
    await runTree(argv);

    expect(vi.mocked(detectRepoName)).not.toHaveBeenCalled();
    expect(vi.mocked(createPullRequestThread)).toHaveBeenCalledWith(
      expect.any(Object), 'other-repo', expect.any(Object), 4804, 'text', undefined,
    );
  });
});

describe('pr comments edit — nested vs alias option plumbing', () => {
  it.each([
    ['nested', ['pr', 'comments', 'edit', '148', 'new', '--pr-number', '4804', '--json']],
    ['alias', ['pr', 'comment-edit', '148', 'new', '--pr-number', '4804', '--json']],
  ])('%s form honours --pr-number and --json', async (_form, argv) => {
    await runTree(argv);

    expect(vi.mocked(getPullRequestById)).toHaveBeenCalledWith(expect.any(Object), 'repo-name', expect.any(Object), 4804);
    expect(JSON.parse(getStdout())).toEqual({
      pullRequestId: 4804,
      threadId: 148,
      commentId: 3,
      previousContent: 'original',
      content: 'new',
      dryRun: false,
    });
  });
});

describe('pr comments reply — nested vs alias option plumbing', () => {
  it.each([
    ['nested', ['pr', 'comments', 'reply', '148', 'hello', '--pr-number', '4804', '--json']],
    ['alias', ['pr', 'comment-reply', '148', 'hello', '--pr-number', '4804', '--json']],
  ])('%s form honours --pr-number and --json', async (_form, argv) => {
    await runTree(argv);

    expect(vi.mocked(getPullRequestById)).toHaveBeenCalledWith(expect.any(Object), 'repo-name', expect.any(Object), 4804);
    expect(JSON.parse(getStdout())).toEqual({
      pullRequestId: 4804,
      threadId: 148,
      commentId: 9,
      content: 'reply',
    });
  });
});

describe('pr work-items link|unlink — nested option plumbing', () => {
  it('honours --pr-number, --repo, and --json on link', async () => {
    await runTree(['pr', 'work-items', 'link', '1234', '--pr-number', '4804', '--repo', 'other-repo', '--json']);

    expect(vi.mocked(getPullRequestById)).toHaveBeenCalledWith(expect.any(Object), 'other-repo', expect.any(Object), 4804);
    expect(vi.mocked(detectRepoName)).not.toHaveBeenCalled();
    expect(vi.mocked(linkWorkItemToPullRequest)).toHaveBeenCalledWith(expect.any(Object), 'other-repo', expect.any(Object), 4804, 1234);
    expect(JSON.parse(getStdout())).toEqual({ pullRequestId: 4804, workItemId: 1234, noop: false });
    expect(getExitCode()).toBe(0);
  });

  it('honours --pr-number and --json on unlink', async () => {
    await runTree(['pr', 'work-items', 'unlink', '1234', '--pr-number', '4804', '--json']);

    expect(vi.mocked(getPullRequestById)).toHaveBeenCalledWith(expect.any(Object), 'repo-name', expect.any(Object), 4804);
    expect(vi.mocked(unlinkWorkItemFromPullRequest)).toHaveBeenCalledWith(expect.any(Object), 'repo-name', expect.any(Object), 4804, 1234);
    expect(JSON.parse(getStdout())).toEqual({ pullRequestId: 4804, workItemId: 1234, noop: false });
  });

  it('rejects a non-numeric work item id', async () => {
    await runTree(['pr', 'work-items', 'link', 'abc', '--pr-number', '4804']);

    expect(vi.mocked(linkWorkItemToPullRequest)).not.toHaveBeenCalled();
    expect(getExitCode()).toBe(1);
  });
});

describe('pr reviewers add|remove — nested option plumbing', () => {
  it('honours --pr-number, --repo, --required, and --json on add', async () => {
    await runTree(['pr', 'reviewers', 'add', 'jane@example.com', '--pr-number', '4804', '--repo', 'other-repo', '--required', '--json']);

    expect(vi.mocked(getPullRequestById)).toHaveBeenCalledWith(expect.any(Object), 'other-repo', expect.any(Object), 4804);
    expect(vi.mocked(resolveReviewerIdentity)).toHaveBeenCalledWith('test-org', expect.any(Object), 'jane@example.com');
    expect(vi.mocked(addOrUpdatePullRequestReviewer)).toHaveBeenCalledWith(
      expect.any(Object), 'other-repo', expect.any(Object), 4804, 'identity-guid', true,
    );
    expect(JSON.parse(getStdout())).toEqual({
      pullRequestId: 4804,
      reviewer: { id: 'identity-guid', displayName: 'Jane Reviewer', uniqueName: 'jane@example.com', isRequired: false },
      noop: false,
    });
  });

  it('defaults to optional when --required is omitted', async () => {
    await runTree(['pr', 'reviewers', 'add', 'jane@example.com', '--pr-number', '4804']);

    expect(vi.mocked(addOrUpdatePullRequestReviewer)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 4804, 'identity-guid', false,
    );
  });

  it('honours --pr-number and --json on remove', async () => {
    await runTree(['pr', 'reviewers', 'remove', 'jane@example.com', '--pr-number', '4804', '--json']);

    expect(vi.mocked(removePullRequestReviewer)).toHaveBeenCalledWith(expect.any(Object), 'repo-name', expect.any(Object), 4804, 'identity-guid');
    expect(JSON.parse(getStdout())).toEqual({
      pullRequestId: 4804,
      reviewer: { id: 'identity-guid', displayName: 'Jane Reviewer', uniqueName: 'jane@example.com', isRequired: false },
      noop: false,
    });
  });

  it('reports an unresolvable reviewer identity with exit code 1', async () => {
    vi.mocked(resolveReviewerIdentity).mockRejectedValue(new Error('RESOLVE_FAILED:nobody@example.com'));

    await runTree(['pr', 'reviewers', 'add', 'nobody@example.com', '--pr-number', '4804']);

    expect(vi.mocked(addOrUpdatePullRequestReviewer)).not.toHaveBeenCalled();
    expect(getExitCode()).toBe(1);
  });
});
