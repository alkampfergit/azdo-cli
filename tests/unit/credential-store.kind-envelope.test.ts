import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  entries: new Map<string, string>(),
}));

vi.mock('@napi-rs/keyring', () => {
  class MockEntry {
    private readonly key: string;
    constructor(service: string, account: string) {
      this.key = `${service}::${account}`;
    }
    getPassword(): string | null {
      return state.entries.has(this.key) ? state.entries.get(this.key)! : null;
    }
    setPassword(value: string): void {
      state.entries.set(this.key, value);
    }
    deletePassword(): boolean {
      if (!state.entries.has(this.key)) return false;
      state.entries.delete(this.key);
      return true;
    }
  }
  return { Entry: MockEntry };
});

const appendAuthAuditEventMock = vi.hoisted(() => vi.fn());
const readAuditEventsMock = vi.hoisted(() => vi.fn(() => []));

vi.mock('../../src/services/audit-log.js', () => ({
  appendAuthAuditEvent: appendAuthAuditEventMock,
  getAuditLogPath: () => '/private/azdo-test-unused-audit.log',
  readAuditEvents: readAuditEventsMock,
}));

vi.mock('../../src/services/config-store.js', () => ({
  loadConfig: () => ({}),
  getConfigPath: () => '/private/azdo-test-unused-config.json',
  saveConfig: vi.fn(),
  SETTINGS: [],
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
  unsetConfigValue: vi.fn(),
}));

describe('credential-store — kind-aware envelope', () => {
  beforeEach(() => {
    state.entries.clear();
    appendAuthAuditEventMock.mockReset();
    readAuditEventsMock.mockReset().mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips a PAT envelope', async () => {
    const { storePat, getStoredCredential } = await import('../../src/services/credential-store.js');
    await storePat('orgA', 'tokenA');

    const cred = await getStoredCredential('orgA');
    expect(cred).toEqual({ kind: 'pat', token: 'tokenA' });
    // Verify the stored bytes are the JSON envelope, not the bare token
    expect(state.entries.get('azdo-cli::pat:orgA')).toBe(JSON.stringify({ kind: 'pat', token: 'tokenA' }));
  });

  it('round-trips an OAuth envelope', async () => {
    const { storeOAuthCredential, getStoredCredential } = await import('../../src/services/credential-store.js');
    const issuedAt = 1745780000;
    const expiresAt = issuedAt + 3600;
    await storeOAuthCredential('orgB', {
      kind: 'oauth',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt,
      issuedAt,
      accountId: 'oid:abc',
      scope: '499b84ac-1321-427f-aa17-267ca6975798/vso.work offline_access openid',
      tenantId: 'organizations',
    });
    const cred = await getStoredCredential('orgB');
    expect(cred).toEqual({
      kind: 'oauth',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt,
      issuedAt,
      accountId: 'oid:abc',
      scope: '499b84ac-1321-427f-aa17-267ca6975798/vso.work offline_access openid',
      tenantId: 'organizations',
    });
  });

  it('reads a legacy bare-PAT entry as kind:pat without rewriting on read', async () => {
    state.entries.set('azdo-cli::pat:legacyOrg', 'legacy-bare-pat');
    const { getStoredCredential } = await import('../../src/services/credential-store.js');

    const cred = await getStoredCredential('legacyOrg');
    expect(cred).toEqual({ kind: 'pat', token: 'legacy-bare-pat' });
    // Storage value is unchanged after read
    expect(state.entries.get('azdo-cli::pat:legacyOrg')).toBe('legacy-bare-pat');
  });

  it('rewrites a legacy bare-PAT entry as JSON envelope only on explicit re-store', async () => {
    state.entries.set('azdo-cli::pat:foo', 'legacy-bare');
    const { storePat } = await import('../../src/services/credential-store.js');

    await storePat('foo', 'new-pat');
    expect(state.entries.get('azdo-cli::pat:foo')).toBe(JSON.stringify({ kind: 'pat', token: 'new-pat' }));
  });

  it('rejects an envelope with an unknown kind', async () => {
    state.entries.set('azdo-cli::pat:weird', JSON.stringify({ kind: 'sso', value: 'x' }));
    const { getStoredCredential } = await import('../../src/services/credential-store.js');
    const { CredentialStoreUnavailableError } = await import('../../src/types/credential.js');

    await expect(getStoredCredential('weird')).rejects.toBeInstanceOf(CredentialStoreUnavailableError);
  });

  it('rejects an OAuth envelope whose lifetime exceeds the 24h sanity bound', async () => {
    const { storeOAuthCredential } = await import('../../src/services/credential-store.js');
    const issuedAt = 1745780000;
    const expiresAt = issuedAt + 25 * 3600;
    await expect(
      storeOAuthCredential('orgX', {
        kind: 'oauth',
        accessToken: 'a',
        refreshToken: null,
        expiresAt,
        issuedAt,
        accountId: 'oid',
        scope: 'vso.work',
        tenantId: 'organizations',
      }),
    ).rejects.toThrow();
  });
});
