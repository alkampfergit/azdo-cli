import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { CliConfig } from '../types/work-item.js';

export interface SettingDefinition {
  key: keyof CliConfig;
  description: string;
  type: 'string' | 'string[]';
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
] as const;

const VALID_KEYS: readonly string[] = SETTINGS.map((s) => s.key);

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
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

function validateKey(key: string): void {
  if (!VALID_KEYS.includes(key)) {
    throw new Error(`Unknown setting key "${key}". Valid keys: org, project, fields`);
  }
}

export function getConfigValue(key: string): string | string[] | undefined {
  validateKey(key);
  const config = loadConfig();
  return config[key as keyof CliConfig];
}

export function setConfigValue(key: string, value: string): void {
  validateKey(key);
  const config = loadConfig();

  if (value === '') {
    delete config[key as keyof CliConfig];
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
