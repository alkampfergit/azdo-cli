import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  getConfigPath,
  loadConfig,
  saveConfig,
  getConfigValue,
  setConfigValue,
  unsetConfigValue,
  resolveScopedConfig,
  setOrgScopedValue,
  getOrgScopedValue,
  unsetOrgScopedValue,
  copyOrgScope,
  moveOrgScope,
  deleteOrgScope,
} from '../../src/services/config-store.js';

let tmpDir: string;
let configPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azdo-config-test-'));
  configPath = path.join(tmpDir, '.azdo', 'config.json');
  vi.spyOn(os, 'homedir').mockReturnValue(tmpDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('getConfigPath', () => {
  it('returns path under home directory', () => {
    expect(getConfigPath()).toBe(configPath);
  });
});

describe('loadConfig', () => {
  it('returns empty config when file does not exist', () => {
    expect(loadConfig()).toEqual({});
  });

  it('warns to stderr and returns empty on corrupt JSON', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, '{invalid json!!!');

    const result = loadConfig();
    expect(result).toEqual({});
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('invalid JSON'),
    );
  });

  it('loads valid config from file', () => {
    const config = { org: 'myorg', project: 'myproject' };
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config));

    expect(loadConfig()).toEqual(config);
  });

  it('loads config with extra unknown keys without error', () => {
    const config = { org: 'myorg', unknownKey: 'value' };
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config));

    const result = loadConfig();
    expect(result.org).toBe('myorg');
  });
});

describe('saveConfig', () => {
  it('creates directory if it does not exist', () => {
    saveConfig({ org: 'testorg' });
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('writes JSON with 2-space indentation', () => {
    saveConfig({ org: 'testorg' });
    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toBe(JSON.stringify({ org: 'testorg' }, null, 2) + '\n');
  });
});

describe('getConfigValue', () => {
  it('throws on unknown key', () => {
    expect(() => getConfigValue('foo')).toThrow(
      'Unknown setting key "foo". Valid keys: org, project, fields',
    );
  });

  it('returns undefined for unset key', () => {
    expect(getConfigValue('org')).toBeUndefined();
  });

  it('returns string value for org', () => {
    saveConfig({ org: 'myorg' });
    expect(getConfigValue('org')).toBe('myorg');
  });

  it('returns array value for fields', () => {
    saveConfig({ fields: ['System.Tags'] });
    expect(getConfigValue('fields')).toEqual(['System.Tags']);
  });

  it('returns boolean value for markdown', () => {
    saveConfig({ markdown: true });
    expect(getConfigValue('markdown')).toBe(true);
  });
});

describe('setConfigValue', () => {
  it('sets org as string', () => {
    setConfigValue('org', 'myorg');
    expect(getConfigValue('org')).toBe('myorg');
  });

  it('sets project as string', () => {
    setConfigValue('project', 'myproject');
    expect(getConfigValue('project')).toBe('myproject');
  });

  it('splits fields by comma into array', () => {
    setConfigValue('fields', 'System.Tags,Microsoft.VSTS.Common.Priority');
    expect(getConfigValue('fields')).toEqual([
      'System.Tags',
      'Microsoft.VSTS.Common.Priority',
    ]);
  });

  it('handles single field value', () => {
    setConfigValue('fields', 'System.Tags');
    expect(getConfigValue('fields')).toEqual(['System.Tags']);
  });

  it('treats empty value as unset', () => {
    setConfigValue('org', 'myorg');
    setConfigValue('org', '');
    expect(getConfigValue('org')).toBeUndefined();
  });

  it('treats empty fields value as unset', () => {
    setConfigValue('fields', 'System.Tags');
    setConfigValue('fields', '');
    expect(getConfigValue('fields')).toBeUndefined();
  });

  it('sets markdown true as boolean', () => {
    setConfigValue('markdown', 'true');
    const config = loadConfig();
    expect(config.markdown).toBe(true);
    expect(typeof config.markdown).toBe('boolean');
  });

  it('sets markdown false as boolean', () => {
    setConfigValue('markdown', 'false');
    const config = loadConfig();
    expect(config.markdown).toBe(false);
    expect(typeof config.markdown).toBe('boolean');
  });

  it('throws on invalid markdown value', () => {
    expect(() => setConfigValue('markdown', 'foo')).toThrow(
      'Invalid value "foo" for markdown',
    );
  });

  it('treats empty markdown value as unset', () => {
    setConfigValue('markdown', 'true');
    setConfigValue('markdown', '');
    expect(getConfigValue('markdown')).toBeUndefined();
  });

  it('throws on unknown key', () => {
    expect(() => setConfigValue('foo', 'bar')).toThrow(
      'Unknown setting key "foo"',
    );
  });

  it('preserves other keys when setting', () => {
    setConfigValue('org', 'myorg');
    setConfigValue('project', 'myproject');
    expect(getConfigValue('org')).toBe('myorg');
    expect(getConfigValue('project')).toBe('myproject');
  });
});

describe('unsetConfigValue', () => {
  it('removes an existing key', () => {
    setConfigValue('org', 'myorg');
    unsetConfigValue('org');
    expect(getConfigValue('org')).toBeUndefined();
  });

  it('is a no-op for nonexistent key', () => {
    expect(() => unsetConfigValue('org')).not.toThrow();
  });

  it('throws on unknown key', () => {
    expect(() => unsetConfigValue('foo')).toThrow(
      'Unknown setting key "foo"',
    );
  });
});

// ── T004: scope resolution (multi-org support #55) ───────────────────────────

describe('resolveScopedConfig', () => {
  it('returns top-level defaults when no org given', () => {
    saveConfig({ project: 'myproj', fields: ['System.Tags'] });
    const result = resolveScopedConfig();
    expect(result.project).toBe('myproj');
    expect(result.fields).toEqual(['System.Tags']);
  });

  it('returns org-scoped values when org has a scope', () => {
    saveConfig({
      project: 'default-proj',
      organizations: { acme: { project: 'acme-proj', fields: ['Custom.Field'] } },
    });
    const result = resolveScopedConfig('acme');
    expect(result.project).toBe('acme-proj');
    expect(result.fields).toEqual(['Custom.Field']);
  });

  it('falls back to default values when org has no matching scope', () => {
    saveConfig({ project: 'myproj' });
    const result = resolveScopedConfig('unknown-org');
    expect(result.project).toBe('myproj');
  });

  it('resolves org names case-insensitively', () => {
    saveConfig({
      project: 'default-proj',
      organizations: { acme: { project: 'acme-proj' } },
    });
    expect(resolveScopedConfig('ACME').project).toBe('acme-proj');
    expect(resolveScopedConfig('Acme').project).toBe('acme-proj');
  });

  it('org scope fully replaces default fields list (no merge)', () => {
    saveConfig({
      fields: ['System.Tags', 'Custom.Default'],
      organizations: { acme: { fields: ['Custom.OrgOnly'] } },
    });
    const result = resolveScopedConfig('acme');
    expect(result.fields).toEqual(['Custom.OrgOnly']);
    expect(result.fields).not.toContain('System.Tags');
  });

  it('falls back to default fields when org scope defines no fields key', () => {
    saveConfig({
      fields: ['System.Tags'],
      organizations: { acme: { project: 'acme-proj' } },
    });
    const result = resolveScopedConfig('acme');
    expect(result.fields).toEqual(['System.Tags']);
  });

  it('reads pre-feature config (no organizations key) without error', () => {
    saveConfig({ org: 'myorg', project: 'myproj' });
    const result = resolveScopedConfig('anyorg');
    expect(result.project).toBe('myproj');
  });

  it('includes org in the resolved result', () => {
    saveConfig({ org: 'myorg' });
    const result = resolveScopedConfig('myorg');
    expect(result.org).toBe('myorg');
  });
});

describe('setOrgScopedValue / getOrgScopedValue / unsetOrgScopedValue', () => {
  it('sets and reads an org-scoped string value', () => {
    setOrgScopedValue('acme', 'project', 'acme-proj');
    expect(getOrgScopedValue('acme', 'project')).toBe('acme-proj');
  });

  it('org key is normalised to lowercase on set', () => {
    setOrgScopedValue('ACME', 'project', 'p');
    expect(getOrgScopedValue('acme', 'project')).toBe('p');
  });

  it('sets org-scoped fields as array', () => {
    setOrgScopedValue('acme', 'fields', 'Custom.A,Custom.B');
    expect(getOrgScopedValue('acme', 'fields')).toEqual(['Custom.A', 'Custom.B']);
  });

  it('unset removes key from org scope and removes empty scope', () => {
    setOrgScopedValue('acme', 'project', 'p');
    unsetOrgScopedValue('acme', 'project');
    const cfg = loadConfig();
    expect(cfg.organizations?.['acme']).toBeUndefined();
  });

  it('throws if "org" is used as a scoped key', () => {
    expect(() => setOrgScopedValue('acme', 'org', 'val')).toThrow();
  });

  it('does not affect default-scope values when setting org scope', () => {
    saveConfig({ project: 'default-proj' });
    setOrgScopedValue('acme', 'project', 'acme-proj');
    expect(getConfigValue('project')).toBe('default-proj');
  });
});

describe('copyOrgScope / moveOrgScope / deleteOrgScope', () => {
  it('copyOrgScope copies from default scope to named org', () => {
    saveConfig({ project: 'default-proj', fields: ['System.Tags'] });
    copyOrgScope('default', 'acme');
    const cfg = loadConfig();
    expect(cfg.organizations?.['acme']?.project).toBe('default-proj');
    expect(cfg.project).toBe('default-proj'); // source unchanged
  });

  it('copyOrgScope from one org to another', () => {
    setOrgScopedValue('acme', 'project', 'acme-proj');
    copyOrgScope('acme', 'globex');
    expect(getOrgScopedValue('globex', 'project')).toBe('acme-proj');
    expect(getOrgScopedValue('acme', 'project')).toBe('acme-proj'); // source unchanged
  });

  it('copyOrgScope throws on collision without force', () => {
    setOrgScopedValue('acme', 'project', 'existing');
    saveConfig({ ...loadConfig(), project: 'default-proj' });
    expect(() => copyOrgScope('default', 'acme')).toThrow();
  });

  it('copyOrgScope with force=true overwrites on collision', () => {
    setOrgScopedValue('acme', 'project', 'old');
    saveConfig({ ...loadConfig(), project: 'new-default' });
    copyOrgScope('default', 'acme', true);
    expect(getOrgScopedValue('acme', 'project')).toBe('new-default');
  });

  it('moveOrgScope moves org scope and removes source', () => {
    setOrgScopedValue('acme', 'project', 'p');
    moveOrgScope('acme', 'globex');
    const cfg = loadConfig();
    expect(cfg.organizations?.['acme']).toBeUndefined();
    expect(cfg.organizations?.['globex']?.project).toBe('p');
  });

  it('deleteOrgScope removes the org scope', () => {
    setOrgScopedValue('acme', 'project', 'p');
    deleteOrgScope('acme');
    expect(loadConfig().organizations?.['acme']).toBeUndefined();
  });

  it('deleteOrgScope is idempotent for non-existent org', () => {
    expect(() => deleteOrgScope('nonexistent')).not.toThrow();
  });
});
