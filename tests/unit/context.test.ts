import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveContext } from '../../src/services/context.js';
import { loadConfig, resolveScopedConfig } from '../../src/services/config-store.js';
import { detectAzdoContext } from '../../src/services/git-remote.js';

vi.mock('../../src/services/config-store.js', () => ({
  loadConfig: vi.fn(),
  resolveScopedConfig: vi.fn(),
}));

vi.mock('../../src/services/git-remote.js', () => ({
  detectAzdoContext: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(loadConfig).mockReturnValue({});
  vi.mocked(resolveScopedConfig).mockReturnValue({});
  vi.mocked(detectAzdoContext).mockImplementation(() => {
    throw new Error('not a git repo');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveContext (hybrid org resolution: flag -> git -> config)', () => {
  it('returns context from CLI flags when both org and project provided', () => {
    const result = resolveContext({ org: 'cliorg', project: 'cliproj' });
    expect(result).toEqual({ org: 'cliorg', project: 'cliproj' });
  });

  it('returns context from config when no CLI flags and no git context', () => {
    vi.mocked(loadConfig).mockReturnValue({ org: 'cfgorg', project: 'cfgproj' });
    vi.mocked(resolveScopedConfig).mockReturnValue({ project: 'cfgproj' });
    const result = resolveContext({});
    expect(result).toEqual({ org: 'cfgorg', project: 'cfgproj' });
  });

  it('falls back to git remote when config is empty', () => {
    vi.mocked(detectAzdoContext).mockReturnValue({ org: 'gitorg', project: 'gitproj' });
    const result = resolveContext({});
    expect(result).toEqual({ org: 'gitorg', project: 'gitproj' });
  });

  it('git remote wins over config for org (new FR-013 order)', () => {
    vi.mocked(loadConfig).mockReturnValue({ org: 'cfgorg', project: 'cfgproj' });
    vi.mocked(resolveScopedConfig).mockReturnValue({ project: 'cfgproj' });
    vi.mocked(detectAzdoContext).mockReturnValue({ org: 'gitorg', project: 'gitproj' });
    const result = resolveContext({});
    // new order: git wins over config for the org
    expect(result.org).toBe('gitorg');
  });

  it('merges git org with config project', () => {
    vi.mocked(loadConfig).mockReturnValue({ project: 'cfgproj' });
    vi.mocked(resolveScopedConfig).mockReturnValue({ project: 'cfgproj' });
    vi.mocked(detectAzdoContext).mockReturnValue({ org: 'gitorg', project: 'gitproj' });
    const result = resolveContext({});
    // git yields both but caller passed no project; we still expect the resolved pair
    expect(result.org).toBe('gitorg');
    expect(result.project).toBeDefined();
  });

  it('ignores git remote errors and falls back', () => {
    vi.mocked(loadConfig).mockReturnValue({ org: 'cfgorg', project: 'cfgproj' });
    vi.mocked(resolveScopedConfig).mockReturnValue({ project: 'cfgproj' });
    vi.mocked(detectAzdoContext).mockImplementation(() => {
      throw new Error('not a git repo');
    });
    const result = resolveContext({});
    expect(result).toEqual({ org: 'cfgorg', project: 'cfgproj' });
  });

  it('throws when no context can be resolved from any source', () => {
    expect(() => resolveContext({})).toThrow(/Azure DevOps organization/);
  });

  it('throws when only org resolved but not project', () => {
    vi.mocked(loadConfig).mockReturnValue({ org: 'cfgorg' });
    vi.mocked(resolveScopedConfig).mockReturnValue({});
    expect(() => resolveContext({})).toThrow(/org\/project/);
  });

  it('error message names all three resolution methods', () => {
    try {
      resolveContext({});
      throw new Error('expected throw');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toMatch(/--org/);
      expect(msg).toMatch(/git/i);
      expect(msg).toMatch(/config/i);
    }
  });

  it('--org flag wins over git remote (new order)', () => {
    vi.mocked(detectAzdoContext).mockReturnValue({ org: 'gitorg', project: 'gitproj' });
    const result = resolveContext({ org: 'cliorg' });
    expect(result.org).toBe('cliorg');
  });
});
