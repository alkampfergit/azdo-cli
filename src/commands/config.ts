import { Command } from 'commander';
import { createInterface } from 'node:readline';
import {
  setConfigValue,
  getConfigValue,
  unsetConfigValue,
  setOrgScopedValue,
  getOrgScopedValue,
  unsetOrgScopedValue,
  copyOrgScope,
  moveOrgScope,
  deleteOrgScope,
  loadConfig,
  SETTINGS,
  type SettingDefinition,
} from '../services/config-store.js';
import type { CliConfig, ConfigValue } from '../types/work-item.js';

function formatConfigValue(
  value: ConfigValue,
  unsetFallback = '',
): string | boolean {
  if (value === undefined) {
    return unsetFallback;
  }

  return Array.isArray(value) ? value.join(',') : value;
}

interface ConfigListEntry {
  scope: string;
  key: string;
  value: ConfigValue;
}

function buildConfigListEntries(cfg: CliConfig): ConfigListEntry[] {
  const entries: ConfigListEntry[] = SETTINGS.map((s) => ({
    scope: 'default',
    key: s.key,
    value: cfg[s.key] as string | string[] | boolean | undefined,
  }));

  for (const [orgName, scope] of Object.entries(cfg.organizations ?? {})) {
    for (const [k, v] of Object.entries(scope as Record<string, unknown>)) {
      entries.push({ scope: orgName, key: k, value: v as string | string[] | boolean | undefined });
    }
  }

  return entries;
}

function writeConfigList(cfg: CliConfig): void {
  const keyWidth = 10;
  const valueWidth = 30;
  const scopeWidth = 12;

  process.stdout.write(
    `${'scope'.padEnd(scopeWidth)}${'key'.padEnd(keyWidth)}${'value'.padEnd(valueWidth)}description\n`,
  );

  for (const setting of SETTINGS) {
    const raw = cfg[setting.key] as string | string[] | boolean | undefined;
    const value = formatConfigValue(raw, '(not set)');
    const marker = raw === undefined && setting.required ? ' *' : '';
    process.stdout.write(
      `${'default'.padEnd(scopeWidth)}${setting.key.padEnd(keyWidth)}${String(value).padEnd(valueWidth)}${setting.description}${marker}\n`,
    );
  }

  for (const [orgName, scope] of Object.entries(cfg.organizations ?? {})) {
    const orgScope = scope;
    const scopedSettings = (Object.entries(orgScope) as [string, unknown][]);
    for (const [k, v] of scopedSettings) {
      const value = formatConfigValue(v as string | string[] | boolean | undefined, '(not set)');
      process.stdout.write(
        `${orgName.padEnd(scopeWidth)}${k.padEnd(keyWidth)}${String(value).padEnd(valueWidth)}\n`,
      );
    }
  }

  const hasUnset = SETTINGS.some((s) => s.required && cfg[s.key] === undefined);
  if (hasUnset) {
    process.stdout.write(
      '\n* = required but not configured. Run "azdo config wizard" to set up.\n',
    );
  }
}

function createAsk(
  rl: ReturnType<typeof createInterface>,
): (prompt: string) => Promise<string> {
  return (prompt: string) => new Promise((resolve) => rl.question(prompt, resolve));
}

async function promptForSetting(
  cfg: CliConfig,
  setting: SettingDefinition,
  ask: (prompt: string) => Promise<string>,
): Promise<void> {
  const currentDisplay = String(formatConfigValue(cfg[setting.key] as string | string[] | boolean | undefined, ''));
  const requiredTag = setting.required ? ' (required)' : ' (optional)';
  process.stderr.write(`${setting.description}${requiredTag}\n`);
  if (setting.example) {
    process.stderr.write(`  Example: ${setting.example}\n`);
  }

  const defaultHint = currentDisplay ? ` [${currentDisplay}]` : '';
  const answer = await ask(`  ${setting.key}${defaultHint}: `);
  const trimmed = answer.trim();

  if (trimmed) {
    setConfigValue(setting.key, trimmed);
    process.stderr.write(`  -> Set "${setting.key}" to "${trimmed}"\n\n`);
    return;
  }

  if (currentDisplay) {
    process.stderr.write(`  -> Kept "${setting.key}" as "${currentDisplay}"\n\n`);
    return;
  }

  process.stderr.write(`  -> Skipped "${setting.key}"\n\n`);
}

export function createConfigCommand(): Command {
  const config = new Command('config');
  config.description('Manage CLI settings');

  const set = new Command('set');
  set
    .description('Set a configuration value')
    .argument('<key>', 'setting key (org, project, fields, markdown)')
    .argument('<value>', 'setting value')
    .option('--org <org>', 'set value in an org-scoped configuration')
    .option('--json', 'output in JSON format')
    .action((key: string, value: string, options: { org?: string; json?: boolean }) => {
      try {
        if (options.org) {
          setOrgScopedValue(options.org, key, value);
        } else {
          setConfigValue(key, value);
        }

        if (options.json) {
          const output: Record<string, unknown> = { key, value, scope: options.org ?? 'default' };
          if (key === 'fields') {
            output.value = value.split(',').map((s) => s.trim());
          }
          process.stdout.write(JSON.stringify(output) + '\n');
        } else {
          const scopeTag = options.org ? ` (org: ${options.org})` : '';
          process.stdout.write(`Set "${key}" to "${value}"${scopeTag}\n`);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: ${message}\n`);
        process.exit(1);
      }
    });

  const get = new Command('get');
  get
    .description('Get a configuration value')
    .argument('<key>', 'setting key (org, project, fields, markdown)')
    .option('--org <org>', 'read from an org-scoped configuration')
    .option('--json', 'output in JSON format')
    .action((key: string, options: { org?: string; json?: boolean }) => {
      try {
        const value = options.org ? getOrgScopedValue(options.org, key) : getConfigValue(key);

        if (options.json) {
          process.stdout.write(
            JSON.stringify({ key, value: value ?? null, scope: options.org ?? 'default' }) + '\n',
          );
        } else if (value === undefined) {
          process.stdout.write(`Setting "${key}" is not configured.\n`);
        } else if (Array.isArray(value)) {
          process.stdout.write(value.join(',') + '\n');
        } else {
          process.stdout.write(String(value) + '\n');
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: ${message}\n`);
        process.exit(1);
      }
    });

  const list = new Command('list');
  list
    .description('List all configuration values')
    .option('--json', 'output in JSON format')
    .action((options: { json?: boolean }) => {
      const cfg = loadConfig();

      if (options.json) {
        const entries = buildConfigListEntries(cfg);
        process.stdout.write(JSON.stringify(entries) + '\n');
        return;
      }

      writeConfigList(cfg);
    });

  const unset = new Command('unset');
  unset
    .description('Remove a configuration value')
    .argument('<key>', 'setting key (org, project, fields, markdown)')
    .option('--org <org>', 'remove from an org-scoped configuration')
    .option('--json', 'output in JSON format')
    .action((key: string, options: { org?: string; json?: boolean }) => {
      try {
        if (options.org) {
          unsetOrgScopedValue(options.org, key);
        } else {
          unsetConfigValue(key);
        }

        if (options.json) {
          process.stdout.write(JSON.stringify({ key, unset: true, scope: options.org ?? 'default' }) + '\n');
        } else {
          const scopeTag = options.org ? ` (org: ${options.org})` : '';
          process.stdout.write(`Unset "${key}"${scopeTag}\n`);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: ${message}\n`);
        process.exit(1);
      }
    });

  const wizard = new Command('wizard');
  wizard
    .description('Interactive wizard to configure all settings')
    .action(async () => {
      if (!process.stdin.isTTY) {
        process.stderr.write(
          'Error: Wizard requires an interactive terminal.\n',
        );
        process.exit(1);
      }

      const cfg = loadConfig();
      const rl = createInterface({
        input: process.stdin,
        output: process.stderr,
      });

      const ask = createAsk(rl);

      process.stderr.write('Azure DevOps CLI - Configuration Wizard\n');
      process.stderr.write('=======================================\n\n');

      for (const setting of SETTINGS) {
        await promptForSetting(cfg, setting, ask);
      }

      rl.close();
      process.stderr.write('Configuration complete!\n');
    });

  const orgCopy = new Command('org-copy');
  orgCopy
    .description('Copy settings from one scope to another (use "default" as source to copy top-level settings)')
    .argument('<from>', 'source scope name or "default"')
    .argument('<to>', 'destination org name')
    .option('--force', 'overwrite existing values on collision')
    .action((from: string, to: string, options: { force?: boolean }) => {
      try {
        copyOrgScope(from, to, options.force ?? false);
        process.stdout.write(`Copied scope "${from}" to "${to}"\n`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: ${message}\n`);
        process.exit(1);
      }
    });

  const orgMove = new Command('org-move');
  orgMove
    .description('Move settings from one org scope to another')
    .argument('<from>', 'source org name')
    .argument('<to>', 'destination org name')
    .option('--force', 'overwrite existing values on collision')
    .action((from: string, to: string, options: { force?: boolean }) => {
      try {
        moveOrgScope(from, to, options.force ?? false);
        process.stdout.write(`Moved scope "${from}" to "${to}"\n`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: ${message}\n`);
        process.exit(1);
      }
    });

  const orgDelete = new Command('org-delete');
  orgDelete
    .description('Delete an org-scoped configuration')
    .argument('<name>', 'org name')
    .action((name: string) => {
      try {
        deleteOrgScope(name);
        process.stdout.write(`Deleted scope "${name}"\n`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: ${message}\n`);
        process.exit(1);
      }
    });

  config.addCommand(set);
  config.addCommand(get);
  config.addCommand(list);
  config.addCommand(unset);
  config.addCommand(orgCopy);
  config.addCommand(orgMove);
  config.addCommand(orgDelete);
  config.addCommand(wizard);

  return config;
}
