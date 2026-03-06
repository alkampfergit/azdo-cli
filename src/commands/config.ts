import { Command } from 'commander';
import {
  setConfigValue,
  getConfigValue,
  unsetConfigValue,
  loadConfig,
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
        const entries: [string, string][] = [];
        if (cfg.org) entries.push(['org', cfg.org]);
        if (cfg.project) entries.push(['project', cfg.project]);
        if (cfg.fields && cfg.fields.length > 0)
          entries.push(['fields', cfg.fields.join(',')]);

        if (entries.length === 0) {
          process.stdout.write('No settings configured.\n');
        } else {
          for (const [k, v] of entries) {
            process.stdout.write(`${k.padEnd(10)}${v}\n`);
          }
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

  config.addCommand(set);
  config.addCommand(get);
  config.addCommand(list);
  config.addCommand(unset);

  return config;
}
