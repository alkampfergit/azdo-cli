import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrAbandonCommand, createPrReactivateCommand } from '../../src/commands/pr.js';
import { createCommandRunner, getExitCode, getStderr, getStdout, setupProcessSpies } from './helpers/command-test-utils.js';

vi.mock('../../src/services/pr-client.js', () => ({
  updatePullRequest: vi.fn(),
  listPullRequests: vi.fn(),
  getPullRequestById: vi.fn(),
}));

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

import { getPullRequestById, listPullRequests, updatePullRequest } from '../../src/services/pr-client.js';
import { detectRepoName, getCurrentBranch } from '../../src/services/git-remote.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const runAbandon = createCommandRunner(createPrAbandonCommand);
const runReactivate = createCommandRunner(createPrReactivateCommand);

const activePr = {
  id: 97,
  title: 'pr: add azdo pr abandon',
  repository: 'repo-name',
  sourceRefName: 'refs/heads/feature/test',
  targetRefName: 'refs/heads/develop',
  status: 'active',
  createdBy: 'Alice',
  url: 'https://example.test/pr/97',
  description: 'body',
};
const abandonedPr = { ...activePr, status: 'abandoned' };
const completedPr = { ...activePr, status: 'completed' };

beforeEach(() => {
  vi.clearAllMocks();
  setupProcessSpies();
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(detectRepoName).mockReturnValue('repo-name');
  vi.mocked(getCurrentBranch).mockReturnValue('feature/test');
  vi.mocked(getPullRequestById).mockResolvedValue(activePr);
  vi.mocked(listPullRequests).mockResolvedValue([activePr]);
  vi.mocked(updatePullRequest).mockImplementation(async (_ctx, _repo, _cred, prId, fields) => ({
    ...activePr,
    id: prId,
    status: fields.status ?? activePr.status,
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pr abandon — status change (FR-001, FR-005)', () => {
  it('PATCHes status:abandoned and nothing else', async () => {
    await runAbandon(['--pr-number', '97']);

    expect(vi.mocked(updatePullRequest)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 97, { status: 'abandoned' },
    );
    expect(getStdout()).toContain('Abandoned pull request #97 (pr: add azdo pr abandon).');
    expect(getStdout()).toContain('https://example.test/pr/97');
    expect(getExitCode()).toBe(0);
  });

  it('reports the change in --json with the previous status (FR-010)', async () => {
    await runAbandon(['--pr-number', '97', '--json']);

    expect(JSON.parse(getStdout())).toEqual({
      pullRequestId: 97,
      title: 'pr: add azdo pr abandon',
      status: 'abandoned',
      previousStatus: 'active',
      url: 'https://example.test/pr/97',
      noop: false,
    });
  });

  it('resolves the current branch\'s ACTIVE pull request when --pr-number is omitted (FR-004)', async () => {
    await runAbandon([]);

    expect(vi.mocked(listPullRequests)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 'feature/test', { status: 'active' },
    );
    expect(vi.mocked(updatePullRequest)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 97, { status: 'abandoned' },
    );
  });

  it('rejects an invalid --pr-number before any call', async () => {
    await runAbandon(['--pr-number', 'abc']);

    expect(getStderr()).toContain('Invalid --pr-number "abc"; expected a positive integer.');
    expect(getExitCode()).toBe(1);
    expect(vi.mocked(updatePullRequest)).not.toHaveBeenCalled();
  });

  it('exits 3 when the pull request does not exist', async () => {
    vi.mocked(getPullRequestById).mockRejectedValue(new Error('NOT_FOUND'));

    await runAbandon(['--pr-number', '404']);

    expect(getStderr()).toContain('Pull request #404 not found in test-org/test-project/repo-name.');
    expect(getExitCode()).toBe(3);
  });

  it('surfaces a server rejection through the group error handler', async () => {
    vi.mocked(updatePullRequest).mockRejectedValue(
      new Error('PERMISSION_DENIED: TF401027: you need Contribute permission'),
    );

    await runAbandon(['--pr-number', '97']);

    expect(getStderr()).toContain('Access denied');
    expect(getExitCode()).toBe(4);
  });
});

describe('pr reactivate — status change (FR-002, FR-004)', () => {
  beforeEach(() => {
    vi.mocked(getPullRequestById).mockResolvedValue(abandonedPr);
    vi.mocked(listPullRequests).mockResolvedValue([abandonedPr]);
    vi.mocked(updatePullRequest).mockImplementation(async (_ctx, _repo, _cred, prId, fields) => ({
      ...abandonedPr,
      id: prId,
      status: fields.status ?? abandonedPr.status,
    }));
  });

  it('PATCHes status:active and nothing else', async () => {
    await runReactivate(['--pr-number', '97']);

    expect(vi.mocked(updatePullRequest)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 97, { status: 'active' },
    );
    expect(getStdout()).toContain('Reactivated pull request #97 (pr: add azdo pr abandon).');
    expect(getExitCode()).toBe(0);
  });

  it('searches ABANDONED pull requests for the branch, not active ones', async () => {
    await runReactivate([]);

    expect(vi.mocked(listPullRequests)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 'feature/test', { status: 'abandoned' },
    );
  });

  it('names the abandoned search in the zero-match message', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([]);

    await runReactivate([]);

    expect(getStderr()).toContain(
      'No abandoned pull request matches branch feature/test. Pass --pr-number to target a specific PR.',
    );
    expect(getExitCode()).toBe(1);
    expect(vi.mocked(updatePullRequest)).not.toHaveBeenCalled();
  });

  it('names the abandoned search in the multi-match message', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([abandonedPr, { ...abandonedPr, id: 98 }]);

    await runReactivate([]);

    expect(getStderr()).toContain(
      'Multiple abandoned pull requests match branch feature/test: #97, #98. Re-run with --pr-number to choose.',
    );
    expect(getExitCode()).toBe(1);
  });

  it('reports the change in --json with the previous status', async () => {
    await runReactivate(['--pr-number', '97', '--json']);

    expect(JSON.parse(getStdout())).toEqual({
      pullRequestId: 97,
      title: 'pr: add azdo pr abandon',
      status: 'active',
      previousStatus: 'abandoned',
      url: 'https://example.test/pr/97',
      noop: false,
    });
  });
});

describe('pr abandon / reactivate — no-op (FR-006)', () => {
  it('issues no PATCH when the pull request is already abandoned', async () => {
    vi.mocked(getPullRequestById).mockResolvedValue(abandonedPr);

    await runAbandon(['--pr-number', '97']);

    expect(vi.mocked(updatePullRequest)).not.toHaveBeenCalled();
    expect(getStdout()).toContain('Pull request #97 is already abandoned; nothing to do.');
    expect(getExitCode()).toBe(0);
  });

  it('issues no PATCH when the pull request is already active', async () => {
    await runReactivate(['--pr-number', '97']);

    expect(vi.mocked(updatePullRequest)).not.toHaveBeenCalled();
    expect(getStdout()).toContain('Pull request #97 is already active; nothing to do.');
    expect(getExitCode()).toBe(0);
  });

  it('reports noop:true with status === previousStatus in --json', async () => {
    vi.mocked(getPullRequestById).mockResolvedValue(abandonedPr);

    await runAbandon(['--pr-number', '97', '--json']);

    expect(JSON.parse(getStdout())).toEqual({
      pullRequestId: 97,
      title: 'pr: add azdo pr abandon',
      status: 'abandoned',
      previousStatus: 'abandoned',
      url: 'https://example.test/pr/97',
      noop: true,
    });
  });
});

describe('pr abandon / reactivate — completed pull requests (FR-007)', () => {
  beforeEach(() => {
    vi.mocked(getPullRequestById).mockResolvedValue(completedPr);
  });

  it('refuses to abandon a completed pull request, without writing', async () => {
    await runAbandon(['--pr-number', '97']);

    expect(getStderr()).toContain(
      'Pull request #97 is completed and cannot be abandoned. A completed pull request is final; revert it with a new pull request instead.',
    );
    expect(getExitCode()).toBe(1);
    expect(vi.mocked(updatePullRequest)).not.toHaveBeenCalled();
  });

  it('refuses to reactivate a completed pull request, without writing', async () => {
    await runReactivate(['--pr-number', '97']);

    expect(getStderr()).toContain(
      'Pull request #97 is completed and cannot be reactivated. A completed pull request is final; revert it with a new pull request instead.',
    );
    expect(getExitCode()).toBe(1);
    expect(vi.mocked(updatePullRequest)).not.toHaveBeenCalled();
  });

  it('does not read a completed pull request as an "already abandoned" no-op', async () => {
    await runAbandon(['--pr-number', '97', '--json']);

    expect(getStdout()).toBe('');
  });
});

describe('pr abandon / reactivate — never prompts (FR-008)', () => {
  it('writes the status change without reading standard input, even under a TTY', async () => {
    const isTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    const stdinRead = vi.spyOn(process.stdin, 'on');

    try {
      await runAbandon(['--pr-number', '97']);
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: isTTY, configurable: true });
    }

    expect(stdinRead).not.toHaveBeenCalled();
    expect(vi.mocked(updatePullRequest)).toHaveBeenCalledTimes(1);
    expect(getExitCode()).toBe(0);
  });
});

// A 401/403 can just as easily come from the pull request LOOKUP as from the
// PATCH. The context is resolved before that lookup, so the guidance must name
// the project either way — reporting project "undefined" here sends the
// operator hunting for a configuration problem that does not exist.
describe('pr abandon / reactivate — permission failures name the resolved project', () => {
  it('names the project when the --pr-number lookup is denied', async () => {
    vi.mocked(getPullRequestById).mockRejectedValue(
      new Error('PERMISSION_DENIED: TF401027: you need Read permission'),
    );

    await runAbandon(['--pr-number', '97']);

    expect(getStderr()).toContain('project "test-project"');
    expect(getStderr()).not.toContain('undefined');
    expect(getExitCode()).toBe(4);
  });

  it('names the project when the branch lookup is denied', async () => {
    vi.mocked(listPullRequests).mockRejectedValue(
      new Error('PERMISSION_DENIED: TF401027: you need Read permission'),
    );

    await runReactivate([]);

    expect(getStderr()).toContain('project "test-project"');
    expect(getStderr()).not.toContain('undefined');
    expect(getExitCode()).toBe(4);
  });

  it('names the repository in a not-found failure raised by the branch lookup', async () => {
    vi.mocked(listPullRequests).mockRejectedValue(new Error('NOT_FOUND | url=…'));

    await runAbandon([]);

    expect(getStderr()).toContain('Azure DevOps repository not found in test-org/test-project.');
    expect(getExitCode()).toBe(3);
  });
});
