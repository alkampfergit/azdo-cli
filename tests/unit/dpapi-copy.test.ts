import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const keyring = vi.hoisted(() => ({ entries: new Map<string, string>(), touched: 0 }));

vi.mock('@napi-rs/keyring', () => {
  class MockEntry {
    private readonly key: string;
    constructor(service: string, account: string) {
      keyring.touched += 1;
      this.key = `${service}::${account}`;
    }
    getPassword(): string | null {
      return keyring.entries.get(this.key) ?? null;
    }
    setPassword(value: string): void {
      keyring.entries.set(this.key, value);
    }
    deletePassword(): boolean {
      return keyring.entries.delete(this.key);
    }
  }
  return { Entry: MockEntry };
});

vi.mock('../../src/services/dpapi-binding.js', () => {
  const xor = (data: Uint8Array) => Buffer.from(Array.from(data, (b) => b ^ 0x5a));
  return {
    loadDpapi: () => ({
      protectData: (data: Uint8Array) => xor(data),
      unprotectData: (data: Uint8Array) => xor(data),
    }),
  };
});

const appendAuthAuditEventMock = vi.hoisted(() => vi.fn());
const readAuditEventsMock = vi.hoisted(() => vi.fn(() => [] as Array<{ event: string; org: string }>));
vi.mock('../../src/services/audit-log.js', () => ({
  appendAuthAuditEvent: appendAuthAuditEventMock,
  readAuditEvents: readAuditEventsMock,
}));

const loadConfigMock = vi.hoisted(() =>
  vi.fn(() => ({}) as { org?: string; credentialStore?: string; organizations?: Record<string, object> }),
);
vi.mock('../../src/services/config-store.js', () => ({ loadConfig: loadConfigMock }));

import { copyKeyringCredentialsToDpapi, listKeyringCredentials } from '../../src/services/credential-store.js';
import { offerKeyringToDpapiCopy, type DpapiCopyIo } from '../../src/services/dpapi-copy.js';
import { DpapiEntry, dpapiFilePath } from '../../src/services/dpapi-store.js';

let home: string;
const oauth = JSON.stringify({
  kind: 'oauth',
  accessToken: 'at',
  refreshToken: 'rt',
  expiresAt: 2000,
  issuedAt: 1000,
  accountId: 'acct-1',
  scope: 'vso.work',
  tenantId: 't',
});

function io(interactive: boolean, answer = ''): DpapiCopyIo & { notices: string[]; asked: string[] } {
  const notices: string[] = [];
  const asked: string[] = [];
  return {
    interactive,
    notices,
    asked,
    ask: async (prompt) => {
      asked.push(prompt);
      return answer;
    },
    notice: (m) => notices.push(m),
  };
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'azdo-dpapi-copy-'));
  vi.spyOn(os, 'homedir').mockReturnValue(home);
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  process.env.AZDO_CREDENTIAL_STORE = 'dpapi';
  keyring.entries.clear();
  keyring.touched = 0;
  appendAuthAuditEventMock.mockReset();
  readAuditEventsMock.mockReset().mockReturnValue([
    { event: 'auth.store', org: 'orgA' },
    { event: 'oauth-login-success', org: 'orgB' },
    // A logout from the DPAPI store must not hide the keyring entry.
    { event: 'auth.delete', org: 'orgA' },
  ]);
  loadConfigMock.mockReset().mockReturnValue({ org: 'orgC', organizations: { orgd: {} } });
  keyring.entries.set('azdo-cli::pat:orgA', JSON.stringify({ kind: 'pat', token: 'tokenA' }));
  keyring.entries.set('azdo-cli::pat:orgB', oauth);
  keyring.entries.set('azdo-cli::pat:orgd', 'bare-legacy-pat');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(home, { recursive: true, force: true });
  delete process.env.AZDO_CREDENTIAL_STORE;
});

describe('listKeyringCredentials', () => {
  it('finds keyring credentials for audit-log and config orgs, even with dpapi selected', () => {
    expect(listKeyringCredentials()).toEqual(['orgA', 'orgB', 'orgd']);
  });
});

describe('copyKeyringCredentialsToDpapi', () => {
  it('copies PAT and OAuth values verbatim and leaves the keyring entries in place', () => {
    const result = copyKeyringCredentialsToDpapi(['orgA', 'orgB', 'orgd']);

    expect(result).toEqual({ copied: ['orgA', 'orgB', 'orgd'], skipped: [], failed: [] });
    expect(new DpapiEntry('pat:orgB').getPassword()).toBe(oauth);
    expect(new DpapiEntry('pat:orgd').getPassword()).toBe('bare-legacy-pat');
    expect(keyring.entries.size).toBe(3);
    expect(appendAuthAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.store', org: 'orgA', backend: 'windows-dpapi', masked_pat: expect.any(String) }),
    );
    expect(appendAuthAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.store', org: 'orgB', backend: 'windows-dpapi', accountId: 'acct-1' }),
    );
  });

  it('never overwrites a credential already in the DPAPI store', () => {
    new DpapiEntry('pat:orgA').setPassword('newer');

    const result = copyKeyringCredentialsToDpapi(['orgA']);

    expect(result.skipped).toEqual(['orgA']);
    expect(new DpapiEntry('pat:orgA').getPassword()).toBe('newer');
  });

  it('reports a failing org and carries on with the rest', () => {
    fs.mkdirSync(path.dirname(dpapiFilePath('pat:orgA')), { recursive: true });
    fs.mkdirSync(dpapiFilePath('pat:orgA')); // a directory: reading it fails

    const result = copyKeyringCredentialsToDpapi(['orgA', 'orgB']);

    expect(result.copied).toEqual(['orgB']);
    expect(result.failed).toEqual([{ org: 'orgA', message: expect.stringContaining('Could not read') }]);
  });
});

describe('offerKeyringToDpapiCopy', () => {
  it('asks on a terminal and copies on yes (Enter defaults to yes)', async () => {
    const t = io(true, '');
    const outcome = await offerKeyringToDpapiCopy('ask', t);

    expect(t.asked[0]).toContain('orgA, orgB, orgd');
    expect(outcome.copied).toEqual(['orgA', 'orgB', 'orgd']);
    expect(t.notices.join('')).toContain('left in place');
  });

  it('copies nothing when the answer is no', async () => {
    const t = io(true, 'n');
    const outcome = await offerKeyringToDpapiCopy('ask', t);

    expect(outcome.copied).toEqual([]);
    expect(fs.existsSync(dpapiFilePath('pat:orgA'))).toBe(false);
  });

  it('does not prompt without a terminal; it names the orgs and the flag instead', async () => {
    const t = io(false);
    const outcome = await offerKeyringToDpapiCopy('ask', t);

    expect(t.asked).toEqual([]);
    expect(outcome).toMatchObject({ found: ['orgA', 'orgB', 'orgd'], copied: [] });
    expect(t.notices.join('')).toContain('--copy-credentials');
  });

  it('copies without asking for --copy-credentials, and does nothing for --no-copy-credentials', async () => {
    const yes = io(false);
    expect((await offerKeyringToDpapiCopy('yes', yes)).copied).toHaveLength(3);
    expect(yes.asked).toEqual([]);

    keyring.touched = 0;
    const no = io(true);
    expect(await offerKeyringToDpapiCopy('no', no)).toMatchObject({ found: [], copied: [] });
    expect(keyring.touched).toBe(0);
    expect(no.notices).toEqual([]);
  });

  it('stays quiet when Credential Manager holds nothing', async () => {
    keyring.entries.clear();
    const t = io(true);
    expect(await offerKeyringToDpapiCopy('ask', t)).toMatchObject({ found: [], copied: [] });
    expect(t.asked).toEqual([]);
    expect(t.notices).toEqual([]);
  });

  it('explains how to copy later when Credential Manager is unreachable (SSH)', async () => {
    vi.spyOn(keyring.entries, 'get').mockImplementation(() => {
      throw new Error('no vault in this logon session');
    });
    const t = io(true);
    const outcome = await offerKeyringToDpapiCopy('ask', t);

    expect(outcome.keyringUnavailable).toBe(true);
    expect(t.notices.join('')).toContain('from a console session');
  });
});
