import { Command } from 'commander';
import { createInterface } from 'node:readline';
import {
  setConfigValue,
  getConfigValue,
  unsetConfigValue,
  loadConfig,
  SETTINGS,
} from '../services/config-store.js';

export function createConfigCommand(): Command {
  const config = new Command('config');
  config.description('Manage CLI settings');

  const set = new Command('set');
  set
    .description('Set a configuration value')
    .argument('<key>', 'setting key (org, project, fields)')
    .argument('<value>', 'setting value')
    .option('--json', 'output in JSON format')
    .action((key: string, value: string, options: { json?: boolean }) => {
      try {
        setConfigValue(key, value);

        if (options.json) {
          const output: Record<string, unknown> = { key, value };
          if (key === 'fields') {
            output.value = value.split(',').map((s) => s.trim());
          }
          process.stdout.write(JSON.stringify(output) + '\n');
        } else {
          process.stdout.write(`Set "${key}" to "${value}"\n`);
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
    .argument('<key>', 'setting key (org, project, fields)')
    .option('--json', 'output in JSON format')
    .action((key: string, options: { json?: boolean }) => {
      try {
        const value = getConfigValue(key);

        if (options.json) {
          process.stdout.write(
            JSON.stringify({ key, value: value ?? null }) + '\n',
          );
        } else if (value === undefined) {
          process.stdout.write(`Setting "${key}" is not configured.\n`);
        } else if (Array.isArray(value)) {
          process.stdout.write(value.join(',') + '\n');
        } else {
          process.stdout.write(value + '\n');
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
        process.stdout.write(JSON.stringify(cfg) + '\n');
      } else {
        const keyWidth = 10;
        const valueWidth = 30;

        for (const setting of SETTINGS) {
          const raw = cfg[setting.key];
          const value =
            raw === undefined
              ? '(not set)'
              : Array.isArray(raw)
                ? raw.join(',')
                : raw;
          const marker = raw === undefined && setting.required ? ' *' : '';
          process.stdout.write(
            `${setting.key.padEnd(keyWidth)}${String(value).padEnd(valueWidth)}${setting.description}${marker}\n`,
          );
        }

        const hasUnset = SETTINGS.some(
          (s) => s.required && cfg[s.key] === undefined,
        );
        if (hasUnset) {
          process.stdout.write(
            '\n* = required but not configured. Run "azdo config wizard" to set up.\n',
          );
        }
      }
    });

  const unset = new Command('unset');
  unset
    .description('Remove a configuration value')
    .argument('<key>', 'setting key (org, project, fields)')
    .option('--json', 'output in JSON format')
    .action((key: string, options: { json?: boolean }) => {
      try {
        unsetConfigValue(key);

        if (options.json) {
          process.stdout.write(JSON.stringify({ key, unset: true }) + '\n');
        } else {
          process.stdout.write(`Unset "${key}"\n`);
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

      const ask = (prompt: string): Promise<string> =>
        new Promise((resolve) => rl.question(prompt, resolve));

      process.stderr.write('Azure DevOps CLI - Configuration Wizard\n');
      process.stderr.write('=======================================\n\n');

      for (const setting of SETTINGS) {
        const current = cfg[setting.key];
        const currentDisplay =
          current === undefined
            ? ''
            : Array.isArray(current)
              ? current.join(',')
              : current;

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
        } else if (currentDisplay) {
          process.stderr.write(`  -> Kept "${setting.key}" as "${currentDisplay}"\n\n`);
        } else {
          process.stderr.write(`  -> Skipped "${setting.key}"\n\n`);
        }
      }

      rl.close();
      process.stderr.write('Configuration complete!\n');
    });

  config.addCommand(set);
  config.addCommand(get);
  config.addCommand(list);
  config.addCommand(unset);
  config.addCommand(wizard);

  return config;
}
