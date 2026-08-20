import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrOpenCommand } from '../../src/commands/pr.js';
import { createCommandRunner, getExitCode, getStderr, getStdout, setupProcessSpies } from './helpers/command-test-utils.js';

vi.mock('../../src/services/pr-client.js', () => ({
  openPullRequest: vi.fn(),
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

import { openPullRequest } from '../../src/services/pr-client.js';
import { detectRepoName, getCurrentBranch } from '../../src/services/git-remote.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createPrOpenCommand);

beforeEach(() => {
  setupProcessSpies();
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(detectRepoName).mockReturnValue('repo-name');
  vi.mocked(getCurrentBranch).mockReturnValue('feature/test');
  vi.mocked(openPullRequest).mockResolvedValue({
    branch: 'feature/test',
    targetBranch: 'develop',
    created: true,
    pullRequest: {
      id: 12,
      title: 'Created PR',
      repository: 'repo-name',
      sourceRefName: 'refs/heads/feature/test',
      targetRefName: 'refs/heads/develop',
      status: 'active',
      createdBy: 'Alice',
      url: 'https://example.test/pr/12',
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pr open command', () => {
  it('requires --title', async () => {
    await run(['--description', 'Description']);
    expect(getStderr()).toContain('--title is required for pull request creation.');
    expect(getExitCode()).toBe(1);
  });

  it('requires --description', async () => {
    await run(['--title', 'Title']);
    expect(getStderr()).toContain('--description is required for pull request creation.');
    expect(getExitCode()).toBe(1);
  });

  it('rejects opening a pull request from develop', async () => {
    vi.mocked(getCurrentBranch).mockReturnValue('develop');
    await run(['--title', 'Title', '--description', 'Description']);
    expect(getStderr()).toContain('Pull request creation requires a source branch other than develop.');
    expect(getExitCode()).toBe(1);
  });

  it('prints a creation message when a new pull request is created', async () => {
    await run(['--title', 'Title', '--description', 'Description']);
    expect(getStdout()).toContain('Created pull request #12: Created PR');
    expect(getStdout()).toContain('https://example.test/pr/12');
  });

  it('prints a reuse message when an active pull request already exists', async () => {
    vi.mocked(openPullRequest).mockResolvedValue({
      branch: 'feature/test',
      targetBranch: 'develop',
      created: false,
      pullRequest: {
        id: 12,
        title: 'Existing PR',
        repository: 'repo-name',
        sourceRefName: 'refs/heads/feature/test',
        targetRefName: 'refs/heads/develop',
        status: 'active',
        createdBy: 'Alice',
        url: 'https://example.test/pr/12',
      },
    });

    await run(['--title', 'Title', '--description', 'Description']);

    expect(getStdout()).toContain('Active pull request already exists for feature/test -> develop: #12');
  });

  it('prints an ambiguity error and exits with code 1', async () => {
    vi.mocked(openPullRequest).mockRejectedValue(new Error('AMBIGUOUS_PRS:12,13'));

    await run(['--title', 'Title', '--description', 'Description']);

    expect(getStderr()).toContain('Multiple active pull requests already exist for this branch targeting develop: #12, #13.');
    expect(getExitCode()).toBe(1);
  });

  it('prints JSON output with --json', async () => {
    await run(['--title', 'Title', '--description', 'Description', '--json']);
    expect(JSON.parse(getStdout())).toEqual({
      branch: 'feature/test',
      targetBranch: 'develop',
      created: true,
      pullRequest: {
        id: 12,
        title: 'Created PR',
        repository: 'repo-name',
        sourceRefName: 'refs/heads/feature/test',
        targetRefName: 'refs/heads/develop',
        status: 'active',
        createdBy: 'Alice',
        url: 'https://example.test/pr/12',
      },
    });
  });
});
