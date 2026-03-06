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
    expect(parsed).toEqual({ key: 'org', value: 'myorg' });
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
    expect(parsed).toEqual({ key: 'org', value: null });
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
  it('shows "No settings configured." when empty', async () => {
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => {
      cmd.parse(['list'], { from: 'user' });
    });
    expect(stdout).toContain('No settings configured.');
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

  it('shows JSON output with --json', async () => {
    const { setConfigValue } = await import('../../src/services/config-store.js');
    setConfigValue('org', 'myorg');

    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => {
      cmd.parse(['list', '--json'], { from: 'user' });
    });
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.org).toBe('myorg');
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

  it('returns JSON with --json', async () => {
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => {
      cmd.parse(['unset', 'project', '--json'], { from: 'user' });
    });
    const parsed = JSON.parse(stdout.trim());
    expect(parsed).toEqual({ key: 'project', unset: true });
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
