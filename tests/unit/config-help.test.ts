import { describe, it, expect, vi } from 'vitest';
import type { Command } from 'commander';
import { createConfigCommand, renderSettingsHelp } from '../../src/commands/config.js';
import { SETTINGS } from '../../src/services/config-store.js';
import { CREDENTIAL_STORES } from '../../src/services/credential-store-kind.js';

// `helpInformation()` does not include `addHelpText` blocks, so drive the real
// help output path and capture what a user would see.
function helpOf(cmd: Command): string {
  let out = '';
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  try {
    cmd.outputHelp();
  } finally {
    spy.mockRestore();
  }
  return out;
}

function subcommand(root: Command, name: string): Command {
  const found = root.commands.find((c) => c.name() === name);
  if (!found) throw new Error(`no subcommand ${name}`);
  return found;
}

// The block for one key: from its heading line up to the next blank line.
function blockFor(text: string, key: string): string {
  // Without the `m` flag `$` is end-of-string, so the lazy match runs to the
  // first blank line rather than the first line end.
  const match = new RegExp(`(?:^|\\n) {2}${key} .*?(?=\\n\\n|$)`, 's').exec(text);
  if (!match) throw new Error(`no settings block for ${key}`);
  return match[0];
}

describe('azdo config --help settings section (issue #118)', () => {
  const help = helpOf(createConfigCommand());

  it('lists every registered setting with its description and a paste-ready example', () => {
    for (const setting of SETTINGS) {
      const block = blockFor(help, setting.key);
      expect(block).toContain(setting.description);
      expect(block).toContain(`example: azdo config set ${setting.key} ${setting.example}`);
    }
  });

  it('shows every credentialStore value, flags dpapi as Windows only and names the env override', () => {
    const block = blockFor(help, 'credentialStore');
    for (const store of CREDENTIAL_STORES) {
      expect(block).toContain(store);
    }
    expect(block).toMatch(/dpapi \(Windows only/);
    expect(block).toContain('AZDO_CREDENTIAL_STORE');
    expect(block).toContain('azdo config set credentialStore dpapi');
  });

  it('states the scope of each setting from the registry', () => {
    for (const setting of SETTINGS) {
      const block = blockFor(help, setting.key);
      if (setting.scoped) {
        expect(block).toContain('--org <org>');
      } else {
        expect(block).toContain('scope: global only');
        expect(block).not.toContain('--org');
      }
    }
  });

  it('marks required settings and renders booleans and lists by their accepted shape', () => {
    expect(blockFor(help, 'org')).toContain('required');
    expect(blockFor(help, 'project')).toContain('required');
    expect(blockFor(help, 'fields')).not.toContain('required');
    expect(blockFor(help, 'markdown')).toContain('type: true | false');
    expect(blockFor(help, 'fields')).toContain('type: comma-separated list');
  });

  it('keeps the credential resolution block, after the settings section', () => {
    const settingsAt = help.indexOf('Settings (azdo config set <key> <value>):');
    const credentialsAt = help.indexOf('Credentials are NOT stored in the configuration file');
    expect(settingsAt).toBeGreaterThan(-1);
    expect(credentialsAt).toBeGreaterThan(settingsAt);
    expect(help).toContain('1. the AZDO_PAT environment variable');
    // Exactly one blank line between the two blocks.
    expect(help).toMatch(/example: azdo config set credentialStore dpapi\n\nCredentials are NOT stored/);
  });

  it('renders the section from whatever registry it is given', () => {
    const text = renderSettingsHelp([
      { key: 'org', description: 'D', type: 'string', example: 'x', required: false, scoped: false, env: 'AZDO_X' },
    ]);
    expect(text).toContain('  org   D');
    expect(text).toContain('env: AZDO_X overrides the stored value');
    expect(text.endsWith('\n')).toBe(false);
  });
});

describe('azdo config set|get|unset --help', () => {
  const root = createConfigCommand();

  it.each(['set', 'get', 'unset'])('%s names every key and points at `azdo config --help`', (name) => {
    const help = helpOf(subcommand(root, name));
    for (const setting of SETTINGS) {
      expect(help).toContain(setting.key);
    }
    expect(help).toContain('Run `azdo config --help`');
  });
});
