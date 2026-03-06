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
