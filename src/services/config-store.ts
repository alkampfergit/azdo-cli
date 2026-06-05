import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { CliConfig, ScopedSettings } from '../types/work-item.js';

export interface SettingDefinition {
  key: keyof CliConfig;
  description: string;
  type: 'string' | 'string[]' | 'boolean';
  example: string;
  required: boolean;
}

export const SETTINGS: readonly SettingDefinition[] = [
  {
    key: 'org',
    description: 'Azure DevOps organization name',
    type: 'string',
    example: 'mycompany',
    required: true,
  },
  {
    key: 'project',
    description: 'Azure DevOps project name',
    type: 'string',
    example: 'MyProject',
    required: true,
  },
  {
    key: 'fields',
    description: 'Extra work item fields to include (comma-separated reference names)',
    type: 'string[]',
    example: 'System.Tags,Custom.Priority',
    required: false,
  },
  {
    key: 'markdown',
    description: 'Convert rich text fields to markdown on display',
    type: 'boolean',
    example: 'true',
    required: false,
  },
] as const;

const VALID_KEYS: readonly string[] = SETTINGS.map((s) => s.key);

// Keys valid inside an org-scoped entry: everything except 'org' (which is top-level only).
const SCOPED_KEYS: readonly string[] = ['project', 'fields', 'markdown'];

export function getConfigPath(): string {
  return path.join(os.homedir(), '.azdo', 'config.json');
}

export function loadConfig(): CliConfig {
  const configPath = getConfigPath();
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw err;
  }

  try {
    return JSON.parse(raw) as CliConfig;
  } catch {
    process.stderr.write(`Warning: Config file ${configPath} contains invalid JSON. Using defaults.\n`);
    return {};
  }
}

export function saveConfig(config: CliConfig): void {
  // Normalise org scope keys to lower-case and remove empty scopes.
  if (config.organizations) {
    const normalised: Record<string, ScopedSettings> = {};
    for (const [k, v] of Object.entries(config.organizations)) {
      if (v && Object.keys(v).length > 0) {
        normalised[k.toLowerCase()] = v;
      }
    }
    if (Object.keys(normalised).length > 0) {
      config = { ...config, organizations: normalised };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { organizations: _, ...rest } = config;
      config = rest;
    }
  }

  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

function validateKey(key: string): void {
  if (!VALID_KEYS.includes(key)) {
    throw new Error(`Unknown setting key "${key}". Valid keys: ${VALID_KEYS.join(', ')}`);
  }
}

export function getConfigValue(key: string): string | string[] | boolean | undefined {
  validateKey(key);
  const config = loadConfig();
  return config[key as keyof CliConfig];
}

export function setConfigValue(key: string, value: string): void {
  validateKey(key);
  const config = loadConfig();

  if (value === '') {
    delete config[key as keyof CliConfig];
  } else if (key === 'markdown') {
    if (value !== 'true' && value !== 'false') {
      throw new Error(`Invalid value "${value}" for markdown. Must be "true" or "false".`);
    }
    config.markdown = value === 'true';
  } else if (key === 'fields') {
    config.fields = value.split(',').map((s) => s.trim());
  } else {
    (config as Record<string, unknown>)[key] = value;
  }

  saveConfig(config);
}

export function unsetConfigValue(key: string): void {
  validateKey(key);
  const config = loadConfig();
  delete config[key as keyof CliConfig];
  saveConfig(config);
}

// ── Multi-org: scope resolution ──────────────────────────────────────────────

export function resolveScopedConfig(org?: string): ScopedSettings & { org?: string } {
  const config = loadConfig();
  const base: ScopedSettings & { org?: string } = {
    project: config.project,
    fields: config.fields,
    markdown: config.markdown,
    org: config.org,
  };

  if (!org) return base;

  const scope = config.organizations?.[org.toLowerCase()];
  if (!scope) return base;

  return {
    org: config.org,
    project: scope.project ?? config.project,
    fields: scope.fields ?? config.fields,
    markdown: scope.markdown ?? config.markdown,
  };
}

// ── Multi-org: per-key CRUD inside an org scope ──────────────────────────────

function validateScopedKey(key: string): void {
  if (!SCOPED_KEYS.includes(key)) {
    throw new Error(
      `Invalid scoped key "${key}". Valid scoped keys: ${SCOPED_KEYS.join(', ')}`,
    );
  }
}

function applyValueToScope(scope: ScopedSettings, key: string, value: string): ScopedSettings {
  if (key === 'fields') {
    return { ...scope, fields: value.split(',').map((s) => s.trim()).filter(Boolean) };
  }
  if (key === 'markdown') {
    if (value !== 'true' && value !== 'false') {
      throw new Error(`Invalid value "${value}" for markdown. Must be "true" or "false".`);
    }
    return { ...scope, markdown: value === 'true' };
  }
  return { ...scope, [key]: value };
}

export function setOrgScopedValue(org: string, key: string, value: string): void {
  validateScopedKey(key);
  const config = loadConfig();
  const lc = org.toLowerCase();
  const existing = config.organizations?.[lc] ?? {};
  const updated = applyValueToScope(existing, key, value);
  saveConfig({
    ...config,
    organizations: { ...(config.organizations ?? {}), [lc]: updated },
  });
}

export function unsetOrgScopedValue(org: string, key: string): void {
  validateScopedKey(key);
  const config = loadConfig();
  const lc = org.toLowerCase();
  const scope = config.organizations?.[lc];
  if (!scope) return;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { [key as keyof ScopedSettings]: _, ...rest } = scope;
  saveConfig({
    ...config,
    organizations: { ...(config.organizations ?? {}), [lc]: rest },
  });
}

export function getOrgScopedValue(
  org: string,
  key: string,
): string | string[] | boolean | undefined {
  validateScopedKey(key);
  const config = loadConfig();
  const scope = config.organizations?.[org.toLowerCase()];
  return scope?.[key as keyof ScopedSettings];
}

// ── Multi-org: scope-level operations ────────────────────────────────────────

function readScope(config: CliConfig, name: string): ScopedSettings {
  if (name === 'default') {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { org: _o, organizations: _orgs, ...defaults } = config;
    return defaults;
  }
  return config.organizations?.[name.toLowerCase()] ?? {};
}

export function copyOrgScope(from: string, to: string, force = false): void {
  const config = loadConfig();
  const source = readScope(config, from);
  const toLc = to.toLowerCase();
  const dest = config.organizations?.[toLc] ?? {};

  if (!force) {
    const collisions = (Object.keys(source) as (keyof ScopedSettings)[]).filter(
      (k) => dest[k] !== undefined,
    );
    if (collisions.length > 0) {
      throw new Error(
        `Scope "${toLc}" already has values for: ${collisions.join(', ')}. Use --force to overwrite.`,
      );
    }
  }

  saveConfig({
    ...config,
    organizations: {
      ...(config.organizations ?? {}),
      [toLc]: { ...dest, ...source },
    },
  });
}

export function moveOrgScope(from: string, to: string, force = false): void {
  copyOrgScope(from, to, force);
  if (from !== 'default') {
    deleteOrgScope(from);
  }
}

export function deleteOrgScope(name: string): void {
  const config = loadConfig();
  const lc = name.toLowerCase();
  if (!config.organizations?.[lc]) return;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { [lc]: _, ...rest } = config.organizations;
  saveConfig({ ...config, organizations: rest });
}
