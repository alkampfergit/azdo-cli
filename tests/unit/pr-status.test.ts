import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrStatusCommand } from '../../src/commands/pr.js';
import { createCommandRunner, getStderr, getStdout, setupProcessSpies } from './helpers/command-test-utils.js';

vi.mock('../../src/services/pr-client.js', () => ({
  listPullRequests: vi.fn(),
}));

vi.mock('../../src/services/git-remote.js', () => ({
  detectRepoName: vi.fn(),
  getCurrentBranch: vi.fn(),
}));

vi.mock('../../src/services/auth.js', () => ({
  resolvePat: vi.fn(),
}));

vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(),
}));

import { listPullRequests } from '../../src/services/pr-client.js';
import { detectRepoName, getCurrentBranch } from '../../src/services/git-remote.js';
import { resolvePat } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createPrStatusCommand);

beforeEach(() => {
  setupProcessSpies();
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(resolvePat).mockResolvedValue({ pat: 'test-pat', source: 'env' });
  vi.mocked(detectRepoName).mockReturnValue('repo-name');
  vi.mocked(getCurrentBranch).mockReturnValue('feature/test');
  vi.mocked(listPullRequests).mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pr status command', () => {
  it('prints a no-results message when no pull requests exist', async () => {
    await run([]);
    expect(getStdout()).toContain('No pull requests found for branch feature/test.');
  });

  it('prints a single pull request in text mode', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([
      {
        id: 12,
        title: 'Test PR',
        repository: 'repo-name',
        sourceRefName: 'refs/heads/feature/test',
        targetRefName: 'refs/heads/develop',
        status: 'active',
        createdBy: 'Alice',
        url: 'https://example.test/pr/12',
      },
    ]);

    await run([]);

    const output = getStdout();
    expect(output).toContain('#12 [active] Test PR');
    expect(output).toContain('feature/test -> develop');
    expect(output).toContain('https://example.test/pr/12');
  });

  it('prints multiple pull requests in text mode', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([
      {
        id: 12,
        title: 'Active PR',
        repository: 'repo-name',
        sourceRefName: 'refs/heads/feature/test',
        targetRefName: 'refs/heads/develop',
        status: 'active',
        createdBy: 'Alice',
        url: 'https://example.test/pr/12',
      },
      {
        id: 13,
        title: 'Completed PR',
        repository: 'repo-name',
        sourceRefName: 'refs/heads/feature/test',
        targetRefName: 'refs/heads/main',
        status: 'completed',
        createdBy: 'Alice',
        url: 'https://example.test/pr/13',
      },
    ]);

    await run([]);

    const output = getStdout();
    expect(output).toContain('#12 [active] Active PR');
    expect(output).toContain('#13 [completed] Completed PR');
  });

  it('prints JSON output with --json', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([
      {
        id: 12,
        title: 'Test PR',
        repository: 'repo-name',
        sourceRefName: 'refs/heads/feature/test',
        targetRefName: 'refs/heads/develop',
        status: 'active',
        createdBy: 'Alice',
        url: 'https://example.test/pr/12',
      },
    ]);

    await run(['--json']);

    expect(JSON.parse(getStdout())).toEqual({
      branch: 'feature/test',
      repository: 'repo-name',
      pullRequests: [
        {
          id: 12,
          title: 'Test PR',
          repository: 'repo-name',
          sourceRefName: 'refs/heads/feature/test',
          targetRefName: 'refs/heads/develop',
          status: 'active',
          createdBy: 'Alice',
          url: 'https://example.test/pr/12',
        },
      ],
    });
  });

  it('prints an authentication error and exits with code 1', async () => {
    vi.mocked(listPullRequests).mockRejectedValue(new Error('AUTH_FAILED'));
    await run([]);
    expect(getStderr()).toContain('Authentication failed');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('prints a detached HEAD error and exits with code 1', async () => {
    vi.mocked(getCurrentBranch).mockImplementation(() => {
      throw new Error('Not on a named branch. Check out a named branch and try again.');
    });
    await run([]);
    expect(getStderr()).toContain('Not on a named branch. Check out a named branch and try again.');
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
