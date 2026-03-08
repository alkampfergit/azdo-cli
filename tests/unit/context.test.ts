import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveContext } from '../../src/services/context.js';
import { loadConfig } from '../../src/services/config-store.js';
import { detectAzdoContext } from '../../src/services/git-remote.js';

vi.mock('../../src/services/config-store.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../src/services/git-remote.js', () => ({
  detectAzdoContext: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(loadConfig).mockReturnValue({});
  vi.mocked(detectAzdoContext).mockReturnValue(null as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveContext', () => {
  it('returns context from CLI flags when both org and project provided', () => {
    const result = resolveContext({ org: 'cliorg', project: 'cliproj' });
    expect(result).toEqual({ org: 'cliorg', project: 'cliproj' });
  });

  it('does not call loadConfig when CLI flags are complete', () => {
    resolveContext({ org: 'cliorg', project: 'cliproj' });
    expect(loadConfig).not.toHaveBeenCalled();
  });

  it('returns context from config when no CLI flags', () => {
    vi.mocked(loadConfig).mockReturnValue({ org: 'cfgorg', project: 'cfgproj' });
    const result = resolveContext({});
    expect(result).toEqual({ org: 'cfgorg', project: 'cfgproj' });
  });

  it('falls back to git remote when config is empty', () => {
    vi.mocked(detectAzdoContext).mockReturnValue({ org: 'gitorg', project: 'gitproj' });
    const result = resolveContext({});
    expect(result).toEqual({ org: 'gitorg', project: 'gitproj' });
  });

  it('merges config org with git project', () => {
    vi.mocked(loadConfig).mockReturnValue({ org: 'cfgorg' });
    vi.mocked(detectAzdoContext).mockReturnValue({ org: 'gitorg', project: 'gitproj' });
    const result = resolveContext({});
    expect(result).toEqual({ org: 'cfgorg', project: 'gitproj' });
  });

  it('merges git org with config project', () => {
    vi.mocked(loadConfig).mockReturnValue({ project: 'cfgproj' });
    vi.mocked(detectAzdoContext).mockReturnValue({ org: 'gitorg', project: 'gitproj' });
    const result = resolveContext({});
    expect(result).toEqual({ org: 'gitorg', project: 'cfgproj' });
  });

  it('ignores git remote errors and falls back', () => {
    vi.mocked(loadConfig).mockReturnValue({ org: 'cfgorg', project: 'cfgproj' });
    vi.mocked(detectAzdoContext).mockImplementation(() => {
      throw new Error('not a git repo');
    });
    const result = resolveContext({});
    expect(result).toEqual({ org: 'cfgorg', project: 'cfgproj' });
  });

  it('throws when no context can be resolved from any source', () => {
    expect(() => resolveContext({})).toThrow('Could not determine org/project');
  });

  it('throws when only org resolved but not project', () => {
    vi.mocked(loadConfig).mockReturnValue({ org: 'cfgorg' });
    expect(() => resolveContext({})).toThrow('Could not determine org/project');
  });

  it('throws when only project resolved but not org', () => {
    vi.mocked(loadConfig).mockReturnValue({ project: 'cfgproj' });
    expect(() => resolveContext({})).toThrow('Could not determine org/project');
  });

  it('error message mentions resolution methods', () => {
    expect(() => resolveContext({})).toThrow('--org and --project');
    expect(() => resolveContext({})).toThrow('azdo config set');
  });
});
