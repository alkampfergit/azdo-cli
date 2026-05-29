import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseAzdoRemote } from '../../src/services/git-remote.js';
import { __resetForTests } from '../../src/services/remote-warning.js';

// Contract C-4 (FR-004 / FR-004a): one-time per-process stderr warning when an
// HTTPS remote carries an embedded credential; never echoes any userinfo.

describe('credential-bearing remote warning (C-4)', () => {
  let stderr: ReturnType<typeof vi.spyOn>;
  const written: string[] = [];

  beforeEach(() => {
    __resetForTests();
    written.length = 0;
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      written.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
      return true;
    });
  });

  afterEach(() => {
    stderr.mockRestore();
    __resetForTests();
  });

  function warningLines(): string[] {
    return written.filter((line) => line.includes('embedded credentials'));
  }

  it('emits exactly one warning even when a credential-bearing URL is parsed twice', () => {
    const url = 'https://prxm@dev.azure.com/prxm/Jarvis/_git/jarvis-claude-plugin';
    parseAzdoRemote(url);
    parseAzdoRemote(url);
    expect(warningLines()).toHaveLength(1);
  });

  it('never echoes the user or token segment of a user:token@ URL', () => {
    const user = 'alice';
    const token = 'supersecrettoken123';
    parseAzdoRemote(`https://${user}:${token}@dev.azure.com/contoso/Widgets/_git/api`);
    const line = warningLines()[0] ?? '';
    expect(line).toContain("azdo: warning: origin includes embedded credentials");
    expect(line).not.toContain(user);
    expect(line).not.toContain(token);
  });

  it('emits the exact contract string', () => {
    parseAzdoRemote('https://prxm@dev.azure.com/prxm/Jarvis/_git/jarvis-claude-plugin');
    expect(warningLines()[0]).toBe(
      "azdo: warning: origin includes embedded credentials; consider removing them with 'git remote set-url origin <clean-url>'\n",
    );
  });

  it('emits no warning for a remote without userinfo', () => {
    parseAzdoRemote('https://dev.azure.com/contoso/Widgets/_git/api');
    expect(warningLines()).toHaveLength(0);
  });

  it('emits no warning for an SSH remote (structural user@, not a credential)', () => {
    parseAzdoRemote('git@ssh.dev.azure.com:v3/contoso/Widgets/api');
    expect(warningLines()).toHaveLength(0);
  });
});
