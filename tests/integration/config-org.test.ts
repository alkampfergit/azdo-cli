/**
 * Integration tests — multi-org config CLI (T006, US1).
 *
 * These tests exercise the real `config` command against a temp home directory.
 * No Azure DevOps credentials are required — all operations are local.
 *
 * Covered:
 *   config list   — scope column (table and --json), org-scoped entries shown
 *   org-copy      — copies default or named scope; independent afterwards
 *   org-move      — moves and removes source scope
 *   org-delete    — removes a scope
 *   --force       — overwrites on collision
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azdo-config-org-int-'));
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
  const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  try {
    fn();
  } catch { /* catch EXIT_ */ }
  outSpy.mockRestore();
  errSpy.mockRestore();
  return { stdout, stderr };
}

describe('config list — scope column', () => {
  it('shows default scope for top-level keys in table output', async () => {
    const { saveConfig } = await import('../../src/services/config-store.js');
    saveConfig({ project: 'my-default-project' });

    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => cmd.parse(['list'], { from: 'user' }));
    expect(stdout).toContain('default');
    expect(stdout).toContain('my-default-project');
  });

  it('shows org scope for org-scoped entries in table output', async () => {
    const { setOrgScopedValue } = await import('../../src/services/config-store.js');
    setOrgScopedValue('acme', 'project', 'acme-project');

    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => cmd.parse(['list'], { from: 'user' }));
    expect(stdout).toContain('acme');
    expect(stdout).toContain('acme-project');
  });

  it('--json includes scope field for default entries', async () => {
    const { saveConfig } = await import('../../src/services/config-store.js');
    saveConfig({ org: 'myorg', project: 'myproject' });

    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => cmd.parse(['list', '--json'], { from: 'user' }));
    const entries = JSON.parse(stdout.trim()) as Array<{ scope: string; key: string; value: unknown }>;
    const orgEntry = entries.find((e) => e.key === 'org');
    expect(orgEntry?.scope).toBe('default');
    expect(orgEntry?.value).toBe('myorg');
  });

  it('--json includes scope field for org-scoped entries', async () => {
    const { setOrgScopedValue } = await import('../../src/services/config-store.js');
    setOrgScopedValue('acme', 'project', 'acme-proj');

    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stdout } = captureOutput(() => cmd.parse(['list', '--json'], { from: 'user' }));
    const entries = JSON.parse(stdout.trim()) as Array<{ scope: string; key: string; value: unknown }>;
    const acmeEntry = entries.find((e) => e.scope === 'acme' && e.key === 'project');
    expect(acmeEntry?.value).toBe('acme-proj');
  });
});

describe('config org-copy', () => {
  it('copies default scope to a named org', async () => {
    const { saveConfig, loadConfig } = await import('../../src/services/config-store.js');
    saveConfig({ project: 'default-proj', fields: ['System.Tags'] });

    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    captureOutput(() => cmd.parse(['org-copy', 'default', 'acme'], { from: 'user' }));
    const cfg = loadConfig();
    expect(cfg.organizations?.['acme']?.project).toBe('default-proj');
    // Source unchanged
    expect(cfg.project).toBe('default-proj');
  });

  it('org-copy produces an independent copy — modifying one does not affect the other', async () => {
    const { saveConfig, loadConfig, setOrgScopedValue } = await import('../../src/services/config-store.js');
    saveConfig({ project: 'original' });

    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    captureOutput(() => cmd.parse(['org-copy', 'default', 'acme'], { from: 'user' }));

    // Modify the acme copy
    setOrgScopedValue('acme', 'project', 'acme-modified');
    const cfg = loadConfig();
    // Default scope unchanged
    expect(cfg.project).toBe('original');
    expect(cfg.organizations?.['acme']?.project).toBe('acme-modified');
  });

  it('throws on collision without --force', async () => {
    const { saveConfig, setOrgScopedValue } = await import('../../src/services/config-store.js');
    saveConfig({ project: 'default-proj' });
    setOrgScopedValue('acme', 'project', 'existing');

    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stderr } = captureOutput(() => cmd.parse(['org-copy', 'default', 'acme'], { from: 'user' }));
    expect(stderr).toContain('Error');
  });

  it('--force overwrites on collision', async () => {
    const { saveConfig, setOrgScopedValue, loadConfig } = await import('../../src/services/config-store.js');
    saveConfig({ project: 'new-default' });
    setOrgScopedValue('acme', 'project', 'old-acme');

    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    captureOutput(() => cmd.parse(['org-copy', 'default', 'acme', '--force'], { from: 'user' }));
    expect(loadConfig().organizations?.['acme']?.project).toBe('new-default');
  });
});

describe('config org-move', () => {
  it('moves scope and removes source', async () => {
    const { setOrgScopedValue, loadConfig } = await import('../../src/services/config-store.js');
    setOrgScopedValue('acme', 'project', 'acme-proj');
    setOrgScopedValue('acme', 'fields', 'System.Tags');

    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    captureOutput(() => cmd.parse(['org-move', 'acme', 'globex'], { from: 'user' }));
    const cfg = loadConfig();
    expect(cfg.organizations?.['acme']).toBeUndefined();
    expect(cfg.organizations?.['globex']?.project).toBe('acme-proj');
  });
});

describe('config org-delete', () => {
  it('removes the org scope entirely', async () => {
    const { setOrgScopedValue, loadConfig } = await import('../../src/services/config-store.js');
    setOrgScopedValue('acme', 'project', 'p');

    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    captureOutput(() => cmd.parse(['org-delete', 'acme'], { from: 'user' }));
    expect(loadConfig().organizations?.['acme']).toBeUndefined();
  });

  it('is idempotent — deleting a non-existent scope succeeds silently', async () => {
    const { createConfigCommand } = await import('../../src/commands/config.js');
    const cmd = createConfigCommand();
    const { stderr } = captureOutput(() => cmd.parse(['org-delete', 'nonexistent'], { from: 'user' }));
    expect(stderr).not.toContain('Error');
  });
});
