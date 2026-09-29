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

const loadConfigMock = vi.hoisted(() => vi.fn(() => ({}) as { org?: string; credentialStore?: string }));
vi.mock('../../src/services/config-store.js', () => ({ loadConfig: loadConfigMock }));

import {
  activeCredentialStore,
  deletePat,
  getStoredCredential,
  listOrgsWithStoredPat,
  probeBackend,
  storePat,
} from '../../src/services/credential-store.js';
import { dpapiFilePath } from '../../src/services/dpapi-store.js';
import { CredentialStoreUnavailableError } from '../../src/types/credential.js';

let home: string;
const savedEnv = process.env.AZDO_CREDENTIAL_STORE;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'azdo-cs-dpapi-'));
  vi.spyOn(os, 'homedir').mockReturnValue(home);
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  delete process.env.AZDO_CREDENTIAL_STORE;
  keyring.entries.clear();
  keyring.touched = 0;
  appendAuthAuditEventMock.mockReset();
  readAuditEventsMock.mockReset().mockReturnValue([]);
  loadConfigMock.mockReset().mockReturnValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(home, { recursive: true, force: true });
  if (savedEnv === undefined) delete process.env.AZDO_CREDENTIAL_STORE;
  else process.env.AZDO_CREDENTIAL_STORE = savedEnv;
});

describe('credential store selection (043)', () => {
  it('defaults to the OS keyring', () => {
    expect(activeCredentialStore()).toBe('keyring');
    expect(probeBackend()).toBe('windows-credential-manager');
  });

  it('uses DPAPI when the global config key says so', async () => {
    loadConfigMock.mockReturnValue({ credentialStore: 'dpapi' });

    await storePat('orgA', 'tokenA');

    expect(probeBackend()).toBe('windows-dpapi');
    expect(fs.existsSync(dpapiFilePath('pat:orgA'))).toBe(true);
    expect(keyring.touched).toBe(0);
    expect(await getStoredCredential('orgA')).toEqual({ kind: 'pat', token: 'tokenA' });
  });

  it('lets AZDO_CREDENTIAL_STORE override the config key, both ways', async () => {
    loadConfigMock.mockReturnValue({ credentialStore: 'keyring' });
    process.env.AZDO_CREDENTIAL_STORE = 'DPAPI';
    expect(activeCredentialStore()).toBe('dpapi');

    loadConfigMock.mockReturnValue({ credentialStore: 'dpapi' });
    process.env.AZDO_CREDENTIAL_STORE = 'keyring';
    await storePat('orgA', 'tokenA');
    expect(keyring.entries.get('azdo-cli::pat:orgA')).toContain('tokenA');
    expect(fs.existsSync(dpapiFilePath('pat:orgA'))).toBe(false);
  });

  it('records windows-dpapi as the backend in the audit trail', async () => {
    process.env.AZDO_CREDENTIAL_STORE = 'dpapi';
    await storePat('orgA', 'tokenA');
    expect(appendAuthAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.store', org: 'orgA', backend: 'windows-dpapi' }),
    );
  });

  it('does not move credentials between stores when switching', async () => {
    await storePat('orgA', 'in-keyring');
    process.env.AZDO_CREDENTIAL_STORE = 'dpapi';
    expect(await getStoredCredential('orgA')).toBeNull();
  });

  it('skips the legacy keyring migration under DPAPI', async () => {
    keyring.entries.set('azdo-cli::pat', 'legacy');
    loadConfigMock.mockReturnValue({ org: 'orgA', credentialStore: 'dpapi' });

    expect(await getStoredCredential('orgA')).toBeNull();
    expect(keyring.entries.get('azdo-cli::pat')).toBe('legacy');
  });

  it('deletes and lists DPAPI-stored credentials', async () => {
    process.env.AZDO_CREDENTIAL_STORE = 'dpapi';
    await storePat('orgA', 'tokenA');
    readAuditEventsMock.mockReturnValue([{ event: 'auth.store', org: 'orgA' }]);

    expect(await listOrgsWithStoredPat()).toEqual(['orgA']);
    expect(await deletePat('orgA')).toBe(true);
    expect(fs.existsSync(dpapiFilePath('pat:orgA'))).toBe(false);
  });

  it('refuses dpapi off Windows instead of falling back to the keyring', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    process.env.AZDO_CREDENTIAL_STORE = 'dpapi';

    await expect(storePat('orgA', 'tokenA')).rejects.toThrow(CredentialStoreUnavailableError);
    await expect(storePat('orgA', 'tokenA')).rejects.toThrow(/only available on Windows/);
    expect(keyring.entries.size).toBe(0);
  });

  it('refuses to default to the keyring when the config file cannot be read', async () => {
    loadConfigMock.mockImplementation(() => {
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    });

    expect(() => activeCredentialStore()).toThrow(CredentialStoreUnavailableError);
    expect(() => activeCredentialStore()).toThrow(/Could not read the azdo config file.*EACCES/);
    await expect(storePat('orgA', 'tokenA')).rejects.toThrow(CredentialStoreUnavailableError);
    expect(keyring.touched).toBe(0);
    expect(probeBackend()).toBe('unknown');
  });

  it('lets AZDO_CREDENTIAL_STORE bypass an unreadable config file', () => {
    loadConfigMock.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });
    process.env.AZDO_CREDENTIAL_STORE = 'dpapi';
    expect(activeCredentialStore()).toBe('dpapi');
  });

  it('rejects an unknown store name as unavailable (exit 4)', () => {
    process.env.AZDO_CREDENTIAL_STORE = 'plaintext';
    expect(() => activeCredentialStore()).toThrow(CredentialStoreUnavailableError);
    expect(() => activeCredentialStore()).toThrow(/Must be one of: keyring, dpapi/);
  });
});

describe('Credential Manager unavailable message', () => {
  it('points Windows users at the DPAPI store', () => {
    const err = new CredentialStoreUnavailableError('windows-credential-manager');
    expect(err.message).toContain('azdo config set credentialStore dpapi');
  });

  it('keeps the other backends message unchanged', () => {
    const err = new CredentialStoreUnavailableError('linux-libsecret');
    expect(err.message).toBe(
      "OS secret backend unavailable (linux-libsecret). Install the platform's credential service and try again.",
    );
  });
});
