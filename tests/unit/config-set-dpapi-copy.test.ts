import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const offerMock = vi.hoisted(() =>
  vi.fn(async () => ({ found: ['orgA'], keyringUnavailable: false, copied: ['orgA'], skipped: [], failed: [] })),
);
vi.mock('../../src/services/dpapi-copy.js', () => ({ offerKeyringToDpapiCopy: offerMock }));

import { createConfigCommand } from '../../src/commands/config.js';

let home: string;
let stdout: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'azdo-config-dpapi-copy-'));
  vi.spyOn(os, 'homedir').mockReturnValue(home);
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  offerMock.mockClear();
  stdout = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

async function run(...args: string[]): Promise<void> {
  await createConfigCommand().parseAsync(['set', ...args], { from: 'user' });
}

describe('config set credentialStore dpapi — copy offer', () => {
  it('asks by default after saving the setting', async () => {
    await run('credentialStore', 'dpapi');
    expect(offerMock).toHaveBeenCalledWith('ask', expect.objectContaining({ interactive: expect.any(Boolean) }));
    expect(stdout).toContain('Set "credentialStore" to "dpapi"');
  });

  it('maps --copy-credentials / --no-copy-credentials to yes / no', async () => {
    await run('credentialStore', 'dpapi', '--copy-credentials');
    expect(offerMock).toHaveBeenLastCalledWith('yes', expect.anything());
    await run('credentialStore', 'dpapi', '--no-copy-credentials');
    expect(offerMock).toHaveBeenLastCalledWith('no', expect.anything());
  });

  it('never prompts under --json and reports the copied orgs in the single JSON object', async () => {
    await run('credentialStore', 'dpapi', '--json');
    expect(offerMock).toHaveBeenCalledWith('ask', expect.objectContaining({ interactive: false }));
    expect(JSON.parse(stdout.trim())).toEqual({
      key: 'credentialStore',
      value: 'dpapi',
      scope: 'default',
      credentialsCopied: ['orgA'],
    });
  });

  it('makes no offer when switching to keyring or setting another key', async () => {
    await run('credentialStore', 'keyring');
    await run('org', 'myorg');
    expect(offerMock).not.toHaveBeenCalled();
  });
});
