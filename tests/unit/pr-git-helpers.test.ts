import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import { detectRepoName, getCurrentBranch, parseRepoName } from '../../src/services/git-remote.js';

describe('parseRepoName', () => {
  it('extracts repo name from modern HTTPS Azure DevOps URLs', () => {
    expect(parseRepoName('https://dev.azure.com/org/project/_git/repo-name')).toBe('repo-name');
  });

  it('extracts repo name from legacy HTTPS Azure DevOps URLs', () => {
    expect(parseRepoName('https://org.visualstudio.com/project/_git/repo-name')).toBe('repo-name');
  });

  it('extracts repo name from modern SSH Azure DevOps URLs', () => {
    expect(parseRepoName('git@ssh.dev.azure.com:v3/org/project/repo-name')).toBe('repo-name');
  });

  it('extracts repo name from legacy SSH Azure DevOps URLs', () => {
    expect(parseRepoName('org@vs-ssh.visualstudio.com:v3/org/project/repo-name')).toBe('repo-name');
  });

  it('returns null for non-Azure DevOps URLs', () => {
    expect(parseRepoName('https://github.com/org/repo')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseRepoName('')).toBeNull();
  });
});

describe('detectRepoName', () => {
  beforeEach(() => {
    vi.mocked(execFileSync).mockReset();
  });

  it('returns the repo name from origin', () => {
    vi.mocked(execFileSync).mockReturnValue('https://dev.azure.com/org/project/_git/repo-name\n');
    expect(detectRepoName()).toBe('repo-name');
    expect(execFileSync).toHaveBeenCalledWith(
      expect.any(String),
      ['remote', 'get-url', 'origin'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
  });

  it('throws an actionable error when git remote lookup fails', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('fatal');
    });
    expect(() => detectRepoName()).toThrow('Not in a git repository');
  });

  it('throws an actionable error for non-Azure DevOps remotes', () => {
    vi.mocked(execFileSync).mockReturnValue('https://github.com/org/repo.git\n');
    expect(() => detectRepoName()).toThrow('Git remote "origin" is not an Azure DevOps URL');
  });
});

describe('getCurrentBranch', () => {
  beforeEach(() => {
    vi.mocked(execFileSync).mockReset();
  });

  it('returns the trimmed current branch name', () => {
    vi.mocked(execFileSync).mockReturnValue('feature/test-branch\n');
    expect(getCurrentBranch()).toBe('feature/test-branch');
    expect(execFileSync).toHaveBeenCalledWith(
      expect.any(String),
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
  });

  it('throws for detached HEAD state', () => {
    vi.mocked(execFileSync).mockReturnValue('HEAD\n');
    expect(() => getCurrentBranch()).toThrow('Not on a named branch. Check out a named branch and try again.');
  });
});
