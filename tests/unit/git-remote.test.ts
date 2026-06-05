import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseAzdoRemote, parseRepoName } from '../../src/services/git-remote.js';
import { __resetForTests } from '../../src/services/remote-warning.js';
import { FROZEN_BASELINE } from './fixtures/git-remote.cases.js';

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

// --- 019-fix-pr-command: userinfo + .git recognition matrix (contracts C-5/C-6/C-7) ---

describe('parseAzdoRemote — userinfo + .git recognition (C-5)', () => {
  afterEach(() => {
    __resetForTests();
    vi.restoreAllMocks();
  });

  // Each HTTPS form, expected to resolve to org=contoso / project=Widgets
  // regardless of an optional userinfo prefix and an optional .git suffix.
  const httpsForms: Array<{ label: string; build: (userinfo: string, dotGit: string) => string }> = [
    {
      label: 'HTTPS current (dev.azure.com)',
      build: (u, g) => `https://${u}dev.azure.com/contoso/Widgets/_git/api${g}`,
    },
    {
      label: 'HTTPS legacy DefaultCollection',
      build: (u, g) => `https://${u}contoso.visualstudio.com/DefaultCollection/Widgets/_git/api${g}`,
    },
    {
      label: 'HTTPS legacy',
      build: (u, g) => `https://${u}contoso.visualstudio.com/Widgets/_git/api${g}`,
    },
  ];

  const userinfos = ['', 'prxm@', 'prxm:sometoken@'];
  const suffixes = ['', '.git'];

  for (const form of httpsForms) {
    for (const userinfo of userinfos) {
      for (const dotGit of suffixes) {
        const url = form.build(userinfo, dotGit);
        it(`${form.label} [userinfo="${userinfo || 'none'}" suffix="${dotGit || 'none'}"] → context`, () => {
          // Silence the credential warning so it doesn't pollute test output.
          vi.spyOn(process.stderr, 'write').mockReturnValue(true);
          expect(parseAzdoRemote(url)).toEqual({ org: 'contoso', project: 'Widgets' });
        });
        it(`${form.label} [userinfo="${userinfo || 'none'}" suffix="${dotGit || 'none'}"] → repo`, () => {
          vi.spyOn(process.stderr, 'write').mockReturnValue(true);
          expect(parseRepoName(url)).toBe('api');
        });
      }
    }
  }

  it('accepts SSH current form with a trailing .git suffix', () => {
    expect(parseAzdoRemote('git@ssh.dev.azure.com:v3/contoso/Widgets/api.git')).toEqual({ org: 'contoso', project: 'Widgets' });
    expect(parseRepoName('git@ssh.dev.azure.com:v3/contoso/Widgets/api.git')).toBe('api');
  });

  it('accepts the reported issue #40 URL form', () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(parseAzdoRemote('https://prxm@dev.azure.com/prxm/Jarvis/_git/jarvis-claude-plugin')).toEqual({
      org: 'prxm',
      project: 'Jarvis',
    });
  });
});

describe('parseAzdoRemote — negatives (C-6, FR-003)', () => {
  it.each([
    ['N1 unrelated host', 'https://github.com/owner/repo.git'],
    ['N2 unrelated host with userinfo', 'https://user@github.com/owner/repo.git'],
    ['N3 host-suffix attack with userinfo', 'https://user@dev.azure.com.evil.example/o/p/_git/r'],
    ['N4 host-suffix attack no userinfo', 'https://dev.azure.com.evil.example/o/p/_git/r'],
    ['N5 non-http(s) scheme', 'ftp://dev.azure.com/o/p/_git/r'],
  ])('rejects %s', (_label, url) => {
    expect(parseAzdoRemote(url)).toBeNull();
    expect(parseRepoName(url)).toBeNull();
  });
});

describe('parseAzdoRemote / parseRepoName — frozen parity (C-7, FR-007)', () => {
  for (const c of FROZEN_BASELINE) {
    it(`${c.label} parses byte-identically to the frozen baseline`, () => {
      expect(parseAzdoRemote(c.url)).toEqual(c.context);
      expect(parseRepoName(c.url)).toBe(c.repo);
    });
  }
});

// ── T016: multi-remote detection (multi-org support #55) ─────────────────────

import { parseAllAzdoRemotes, selectRemote } from '../../src/services/git-remote.js';
import type { RemoteCandidate } from '../../src/services/git-remote.js';

describe('parseAllAzdoRemotes', () => {
  it('parses a single AZDO remote from git remote -v output', () => {
    const output = [
      'origin\thttps://dev.azure.com/myorg/myproject/_git/myrepo (fetch)',
      'origin\thttps://dev.azure.com/myorg/myproject/_git/myrepo (push)',
    ].join('\n');
    const candidates = parseAllAzdoRemotes(output);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ remoteName: 'origin', org: 'myorg', project: 'myproject', hasEmbeddedSecret: false });
  });

  it('parses multiple AZDO remotes with different names', () => {
    const output = [
      'origin\thttps://github.com/user/repo.git (fetch)',
      'origin\thttps://github.com/user/repo.git (push)',
      'azdo\thttps://dev.azure.com/myorg/myproject/_git/myrepo (fetch)',
      'azdo\thttps://dev.azure.com/myorg/myproject/_git/myrepo (push)',
    ].join('\n');
    const candidates = parseAllAzdoRemotes(output);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].remoteName).toBe('azdo');
  });

  it('sets hasEmbeddedSecret=true for user:token@ URLs', () => {
    const output = 'azdo\thttps://user:token@dev.azure.com/myorg/myproject/_git/myrepo (fetch)\n';
    const candidates = parseAllAzdoRemotes(output);
    expect(candidates[0].hasEmbeddedSecret).toBe(true);
  });

  it('sets hasEmbeddedSecret=false for bare user@ URLs', () => {
    const output = 'origin\thttps://user@dev.azure.com/myorg/myproject/_git/myrepo (fetch)\n';
    const candidates = parseAllAzdoRemotes(output);
    expect(candidates[0].hasEmbeddedSecret).toBe(false);
  });

  it('deduplicates: same remote appears only once (fetch + push lines)', () => {
    const output = [
      'azdo\thttps://dev.azure.com/myorg/myproject/_git/myrepo (fetch)',
      'azdo\thttps://dev.azure.com/myorg/myproject/_git/myrepo (push)',
    ].join('\n');
    const candidates = parseAllAzdoRemotes(output);
    expect(candidates).toHaveLength(1);
  });

  it('returns empty array when no AZDO remotes', () => {
    const output = 'origin\thttps://github.com/user/repo.git (fetch)\n';
    expect(parseAllAzdoRemotes(output)).toHaveLength(0);
  });

  it('returns empty array for empty output', () => {
    expect(parseAllAzdoRemotes('')).toHaveLength(0);
  });
});

describe('selectRemote', () => {
  const makeCandidate = (remoteName: string, org = 'myorg', project = 'myproject'): RemoteCandidate => ({
    remoteName, org, project, hasEmbeddedSecret: false,
  });

  it('selects origin when origin is among candidates', () => {
    const candidates = [makeCandidate('azdo'), makeCandidate('origin')];
    expect(selectRemote(candidates).remoteName).toBe('origin');
  });

  it('selects the single non-origin AZDO remote', () => {
    const candidates = [makeCandidate('azdo')];
    expect(selectRemote(candidates).remoteName).toBe('azdo');
  });

  it('selects first candidate when all share same org/project (no origin)', () => {
    const candidates = [makeCandidate('upstream'), makeCandidate('fork')];
    expect(selectRemote(candidates).remoteName).toBe('upstream');
  });

  it('throws ambiguity error when multiple distinct org/project and no origin', () => {
    const candidates = [
      makeCandidate('r1', 'org1', 'proj1'),
      makeCandidate('r2', 'org2', 'proj2'),
    ];
    expect(() => selectRemote(candidates)).toThrow(/ambiguous|--org/i);
  });

  it('ambiguity error lists all remote names', () => {
    const candidates = [
      makeCandidate('alpha', 'org1', 'proj1'),
      makeCandidate('beta', 'org2', 'proj2'),
    ];
    try {
      selectRemote(candidates);
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain('alpha');
      expect(msg).toContain('beta');
    }
  });

  it('throws "provide --org and --project" guidance when no candidates', () => {
    expect(() => selectRemote([])).toThrow(/--org/i);
  });
});

// ── T016b: gitConfigToRemoteLines (detectAzdoContext without subprocess) ─────
import { gitConfigToRemoteLines } from '../../src/services/git-remote.js';

describe('gitConfigToRemoteLines', () => {
  it('produces parseAllAzdoRemotes-compatible output for a single remote', () => {
    const config = `[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = https://dev.azure.com/myorg/myproject/_git/myrepo\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`;
    const lines = gitConfigToRemoteLines(config);
    const candidates = parseAllAzdoRemotes(lines);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ remoteName: 'origin', org: 'myorg', project: 'myproject' });
  });

  it('emits one line per remote even when multiple remotes are present', () => {
    const config = [
      '[remote "origin"]',
      '\turl = https://dev.azure.com/org1/proj1/_git/repo1',
      '[remote "upstream"]',
      '\turl = https://dev.azure.com/org2/proj2/_git/repo2',
    ].join('\n');
    const lines = gitConfigToRemoteLines(config);
    expect(lines.split('\n').filter(Boolean)).toHaveLength(2);
    const candidates = parseAllAzdoRemotes(lines);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ remoteName: 'origin', org: 'org1' });
    expect(candidates[1]).toMatchObject({ remoteName: 'upstream', org: 'org2' });
  });

  it('skips non-remote sections without emitting lines', () => {
    const config = '[core]\n\trepositoryformatversion = 0\n[branch "main"]\n\tremote = origin\n';
    expect(gitConfigToRemoteLines(config)).toBe('');
  });

  it('only emits first url= for a remote with multiple url= entries', () => {
    const config = '[remote "origin"]\n\turl = https://dev.azure.com/org1/proj1/_git/repo1\n\turl = https://dev.azure.com/org2/proj2/_git/repo2\n';
    const lines = gitConfigToRemoteLines(config).split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('org1');
  });
});
