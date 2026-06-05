import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azdo-config-cmd-test-'));
  vi.spyOn(os, 'homedir').mockReturnValue(tmpDir);
  vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
    throw new Error(`EXIT_${code}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function captureOutput(fn: () => void): { stdout: string; stderr: string } {
  let stdout = '';
  let stderr = '';
  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });

  try {
    fn();
  } catch {
    // catch EXIT_ errors
  }

  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  return { stdout, stderr };
}

describe('config set', () => {
  it('sets org with human-readable output', async () => {
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => {
      cmd.parse(['set', 'org', 'myorg'], { from: 'user' });
    });
    expect(stdout).toContain('Set "org" to "myorg"');
  });

  it('sets org with --json output', async () => {
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => {
      cmd.parse(['set', 'org', 'myorg', '--json'], { from: 'user' });
    });
    const parsed = JSON.parse(stdout.trim());
    expect(parsed).toMatchObject({ key: 'org', value: 'myorg' });
    expect(parsed.scope).toBe('default');
  });

  it('sets fields with --json returns array', async () => {
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => {
      cmd.parse(['set', 'fields', 'System.Tags,Custom.Field', '--json'], { from: 'user' });
    });
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.value).toEqual(['System.Tags', 'Custom.Field']);
  });

  it('unknown key errors with exit code 1', async () => {
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stderr } = captureOutput(() => {
      cmd.parse(['set', 'badkey', 'val'], { from: 'user' });
    });
    expect(stderr).toContain('Unknown setting key "badkey"');
  });
});

describe('config get', () => {
  it('returns existing value', async () => {
    const { setConfigValue } = await import('../../src/services/config-store.js');
    setConfigValue('org', 'myorg');

    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => {
      cmd.parse(['get', 'org'], { from: 'user' });
    });
    expect(stdout.trim()).toBe('myorg');
  });

  it('shows "not configured" for unset key', async () => {
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => {
      cmd.parse(['get', 'org'], { from: 'user' });
    });
    expect(stdout).toContain('Setting "org" is not configured.');
  });

  it('returns JSON with null for unset key', async () => {
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => {
      cmd.parse(['get', 'org', '--json'], { from: 'user' });
    });
    const parsed = JSON.parse(stdout.trim());
    expect(parsed).toMatchObject({ key: 'org', value: null });
    expect(parsed.scope).toBe('default');
  });

  it('returns fields as comma-separated in human mode', async () => {
    const { setConfigValue } = await import('../../src/services/config-store.js');
    setConfigValue('fields', 'System.Tags,Custom.Field');

    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => {
      cmd.parse(['get', 'fields'], { from: 'user' });
    });
    expect(stdout.trim()).toBe('System.Tags,Custom.Field');
  });

  it('unknown key errors', async () => {
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stderr } = captureOutput(() => {
      cmd.parse(['get', 'badkey'], { from: 'user' });
    });
    expect(stderr).toContain('Unknown setting key "badkey"');
  });
});

describe('config list', () => {
  it('shows all settings with "(not set)" when empty', async () => {
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => {
      cmd.parse(['list'], { from: 'user' });
    });
    expect(stdout).toContain('org');
    expect(stdout).toContain('(not set)');
    expect(stdout).toContain('Azure DevOps organization name');
    expect(stdout).toContain('azdo config wizard');
  });

  it('shows tabular output with settings', async () => {
    const { setConfigValue } = await import('../../src/services/config-store.js');
    setConfigValue('org', 'myorg');
    setConfigValue('project', 'myproject');

    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => {
      cmd.parse(['list'], { from: 'user' });
    });
    expect(stdout).toContain('org');
    expect(stdout).toContain('myorg');
    expect(stdout).toContain('project');
    expect(stdout).toContain('myproject');
  });

  it('shows JSON output with --json as array with scope field', async () => {
    const { setConfigValue } = await import('../../src/services/config-store.js');
    setConfigValue('org', 'myorg');

    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => {
      cmd.parse(['list', '--json'], { from: 'user' });
    });
    const parsed = JSON.parse(stdout.trim()) as Array<{ scope: string; key: string; value: unknown }>;
    const orgEntry = parsed.find((e) => e.key === 'org');
    expect(orgEntry?.value).toBe('myorg');
    expect(orgEntry?.scope).toBe('default');
  });

  it('shows fields as comma-separated in human mode', async () => {
    const { setConfigValue } = await import('../../src/services/config-store.js');
    setConfigValue('fields', 'System.Tags,Custom.Field');

    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => {
      cmd.parse(['list'], { from: 'user' });
    });
    expect(stdout).toContain('System.Tags,Custom.Field');
  });
});

describe('config unset', () => {
  it('unsets existing key with confirmation', async () => {
    const { setConfigValue } = await import('../../src/services/config-store.js');
    setConfigValue('org', 'myorg');

    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => {
      cmd.parse(['unset', 'org'], { from: 'user' });
    });
    expect(stdout).toContain('Unset "org"');
  });

  it('unsets non-existent key without error (idempotent)', async () => {
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => {
      cmd.parse(['unset', 'org'], { from: 'user' });
    });
    expect(stdout).toContain('Unset "org"');
  });

  it('returns JSON with --json including scope field', async () => {
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => {
      cmd.parse(['unset', 'project', '--json'], { from: 'user' });
    });
    const parsed = JSON.parse(stdout.trim());
    expect(parsed).toMatchObject({ key: 'project', unset: true });
    expect(parsed.scope).toBe('default');
  });

  it('unknown key errors', async () => {
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stderr } = captureOutput(() => {
      cmd.parse(['unset', 'badkey'], { from: 'user' });
    });
    expect(stderr).toContain('Unknown setting key "badkey"');
  });
});

// ── T005: config CLI --org option (multi-org support #55) ────────────────────

describe('config set --org', () => {
  it('sets an org-scoped project value', async () => {
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    captureOutput(() => cmd.parse(['set', 'project', 'acme-proj', '--org', 'acme'], { from: 'user' }));
    const { loadConfig } = await import('../../src/services/config-store.js');
    const cfg = loadConfig();
    expect(cfg.organizations?.['acme']?.project).toBe('acme-proj');
  });

  it('does not affect default scope when --org is given', async () => {
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    captureOutput(() => cmd.parse(['set', 'project', 'default-proj'], { from: 'user' }));
    captureOutput(() => cmd.parse(['set', 'project', 'acme-proj', '--org', 'acme'], { from: 'user' }));
    const { loadConfig } = await import('../../src/services/config-store.js');
    const cfg = loadConfig();
    expect(cfg.project).toBe('default-proj');
    expect(cfg.organizations?.['acme']?.project).toBe('acme-proj');
  });
});

describe('config get --org', () => {
  it('reads from org scope when --org is given', async () => {
    const { setOrgScopedValue } = await import('../../src/services/config-store.js');
    setOrgScopedValue('acme', 'project', 'acme-proj');
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => cmd.parse(['get', 'project', '--org', 'acme'], { from: 'user' }));
    expect(stdout).toContain('acme-proj');
  });
});

describe('config unset --org', () => {
  it('removes key from org scope', async () => {
    const { setOrgScopedValue, loadConfig } = await import('../../src/services/config-store.js');
    setOrgScopedValue('acme', 'project', 'p');
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    captureOutput(() => cmd.parse(['unset', 'project', '--org', 'acme'], { from: 'user' }));
    expect(loadConfig().organizations?.['acme']).toBeUndefined();
  });
});

describe('config org-copy / org-move / org-delete', () => {
  it('org-copy copies settings from default to named org', async () => {
    const { saveConfig, loadConfig } = await import('../../src/services/config-store.js');
    saveConfig({ project: 'default-proj' });
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    captureOutput(() => cmd.parse(['org-copy', 'default', 'acme'], { from: 'user' }));
    expect(loadConfig().organizations?.['acme']?.project).toBe('default-proj');
  });

  it('org-move moves and removes source', async () => {
    const { setOrgScopedValue, loadConfig } = await import('../../src/services/config-store.js');
    setOrgScopedValue('acme', 'project', 'p');
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    captureOutput(() => cmd.parse(['org-move', 'acme', 'globex'], { from: 'user' }));
    const cfg = loadConfig();
    expect(cfg.organizations?.['acme']).toBeUndefined();
    expect(cfg.organizations?.['globex']?.project).toBe('p');
  });

  it('org-delete removes the org scope', async () => {
    const { setOrgScopedValue, loadConfig } = await import('../../src/services/config-store.js');
    setOrgScopedValue('acme', 'project', 'p');
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    captureOutput(() => cmd.parse(['org-delete', 'acme'], { from: 'user' }));
    expect(loadConfig().organizations?.['acme']).toBeUndefined();
  });
});

describe('config list with scope', () => {
  it('shows scope column in human-readable output for org-scoped entries', async () => {
    const { setOrgScopedValue, saveConfig } = await import('../../src/services/config-store.js');
    saveConfig({ project: 'default-proj' });
    setOrgScopedValue('acme', 'project', 'acme-proj');
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => cmd.parse(['list'], { from: 'user' }));
    expect(stdout).toContain('acme');
    expect(stdout).toContain('acme-proj');
  });

  it('includes scope field in --json output', async () => {
    const { setOrgScopedValue, saveConfig } = await import('../../src/services/config-store.js');
    saveConfig({ project: 'default-proj' });
    setOrgScopedValue('acme', 'project', 'acme-proj');
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => cmd.parse(['list', '--json'], { from: 'user' }));
    const parsed = JSON.parse(stdout.trim());
    const acmeEntry = (parsed as Array<{ scope: string; key: string; value: unknown }>)
      .find((e) => e.scope === 'acme' && e.key === 'project');
    expect(acmeEntry?.value).toBe('acme-proj');
  });
});
