import { describe, it, expect } from 'vitest';
import { parseAzdoRemote } from '../../src/services/git-remote.js';

describe('parseAzdoRemote', () => {
  it('parses HTTPS current format', () => {
    const result = parseAzdoRemote('https://dev.azure.com/myorg/myproject/_git/myrepo');
    expect(result).toEqual({ org: 'myorg', project: 'myproject' });
  });

  it('parses HTTPS current format with http scheme', () => {
    const result = parseAzdoRemote('http://dev.azure.com/myorg/myproject/_git/myrepo');
    expect(result).toEqual({ org: 'myorg', project: 'myproject' });
  });

  it('parses HTTPS legacy format', () => {
    const result = parseAzdoRemote('https://myorg.visualstudio.com/myproject/_git/myrepo');
    expect(result).toEqual({ org: 'myorg', project: 'myproject' });
  });

  it('parses HTTPS legacy format with DefaultCollection', () => {
    const result = parseAzdoRemote('https://myorg.visualstudio.com/DefaultCollection/myproject/_git/myrepo');
    expect(result).toEqual({ org: 'myorg', project: 'myproject' });
  });

  it('parses SSH current format', () => {
    const result = parseAzdoRemote('git@ssh.dev.azure.com:v3/myorg/myproject/myrepo');
    expect(result).toEqual({ org: 'myorg', project: 'myproject' });
  });

  it('parses SSH legacy format', () => {
    const result = parseAzdoRemote('myorg@vs-ssh.visualstudio.com:v3/myorg/myproject/myrepo');
    expect(result).toEqual({ org: 'myorg', project: 'myproject' });
  });

  it('handles org and project with special characters', () => {
    const result = parseAzdoRemote('https://dev.azure.com/my-org/my%20project/_git/repo');
    expect(result).toEqual({ org: 'my-org', project: 'my%20project' });
  });

  it('returns null for GitHub URL', () => {
    expect(parseAzdoRemote('https://github.com/user/repo.git')).toBeNull();
  });

  it('returns null for GitLab URL', () => {
    expect(parseAzdoRemote('https://gitlab.com/user/repo.git')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseAzdoRemote('')).toBeNull();
  });

  it('returns null for random string', () => {
    expect(parseAzdoRemote('not-a-url-at-all')).toBeNull();
  });
});
