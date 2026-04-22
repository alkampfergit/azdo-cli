import { describe, expect, it } from 'vitest';
import { resolveOrg, formatResolutionError } from '../../src/services/org-resolver.js';

describe('resolveOrg', () => {
  it('returns flag source when --org is provided', () => {
    const result = resolveOrg({
      org: 'fromflag',
      detectFromGit: () => 'fromgit',
      readConfig: () => ({ org: 'fromconfig' }),
    });

    expect(result).toEqual({ org: 'fromflag', source: 'flag' });
  });

  it('returns git source when flag is absent and git detects', () => {
    const result = resolveOrg({
      detectFromGit: () => 'fromgit',
      readConfig: () => ({ org: 'fromconfig' }),
    });

    expect(result).toEqual({ org: 'fromgit', source: 'git' });
  });

  it('returns config source when flag and git are absent', () => {
    const result = resolveOrg({
      detectFromGit: () => null,
      readConfig: () => ({ org: 'fromconfig' }),
    });

    expect(result).toEqual({ org: 'fromconfig', source: 'config' });
  });

  it('returns null when all three sources are empty', () => {
    const result = resolveOrg({
      detectFromGit: () => null,
      readConfig: () => ({}),
    });

    expect(result).toBeNull();
  });

  it('treats an empty-string flag as absent', () => {
    const result = resolveOrg({
      org: '',
      detectFromGit: () => 'fromgit',
      readConfig: () => ({}),
    });

    expect(result).toEqual({ org: 'fromgit', source: 'git' });
  });

  it('tolerates missing injected readers', () => {
    const result = resolveOrg({ org: 'fromflag' });

    expect(result).toEqual({ org: 'fromflag', source: 'flag' });
  });

  it('formatResolutionError mentions all three sources', () => {
    const msg = formatResolutionError();

    expect(msg).toMatch(/--org/);
    expect(msg).toMatch(/git/i);
    expect(msg).toMatch(/config/i);
  });
});
