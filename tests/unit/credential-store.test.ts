import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  entries: new Map<string, string>(),
  backendAvailable: true,
  constructorThrows: false,
}));

vi.mock('@napi-rs/keyring', () => {
  class MockEntry {
    private readonly key: string;
    constructor(service: string, account: string) {
      if (state.constructorThrows) {
        throw new Error('Platform secure storage failure: Unknown(1)');
      }
      this.key = `${service}::${account}`;
    }
    getPassword(): string | null {
      if (!state.backendAvailable) throw new Error('libsecret: no backend available');
      return state.entries.has(this.key) ? state.entries.get(this.key)! : null;
    }
    setPassword(pat: string): void {
      if (!state.backendAvailable) throw new Error('libsecret: no backend available');
      state.entries.set(this.key, pat);
    }
    deletePassword(): boolean {
      if (!state.backendAvailable) throw new Error('libsecret: no backend available');
      if (!state.entries.has(this.key)) return false;
      state.entries.delete(this.key);
      return true;
    }
  }
  return { Entry: MockEntry };
});

const appendAuthAuditEventMock = vi.hoisted(() => vi.fn());
const readAuditEventsMock = vi.hoisted(() =>
  vi.fn(() => [] as Array<{ event: string; org: string; ts: string; backend: string }>),
);

vi.mock('../../src/services/audit-log.js', () => ({
  appendAuthAuditEvent: appendAuthAuditEventMock,
  getAuditLogPath: () => '/private/azdo-test-unused-audit.log',
  readAuditEvents: readAuditEventsMock,
}));

const loadConfigMock = vi.hoisted(() => vi.fn(() => ({}) as { org?: string }));

vi.mock('../../src/services/config-store.js', () => ({
  loadConfig: loadConfigMock,
  getConfigPath: () => '/private/azdo-test-unused-config.json',
  saveConfig: vi.fn(),
  SETTINGS: [],
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
  unsetConfigValue: vi.fn(),
}));

describe('credential-store (multi-org)', () => {
  beforeEach(() => {
    state.entries.clear();
    state.backendAvailable = true;
    state.constructorThrows = false;
    appendAuthAuditEventMock.mockReset();
    readAuditEventsMock.mockReset().mockReturnValue([]);
    loadConfigMock.mockReset().mockReturnValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores and retrieves a PAT per org', async () => {
    const { storePat, getPat } = await import('../../src/services/credential-store.js');

    await storePat('orgA', 'tokenA');
    await storePat('orgB', 'tokenB');

    expect(await getPat('orgA')).toBe('tokenA');
    expect(await getPat('orgB')).toBe('tokenB');
  });

  it('returns null when no PAT is stored for the org', async () => {
    const { getPat } = await import('../../src/services/credential-store.js');
    expect(await getPat('missing')).toBeNull();
  });

  it('deletes a PAT for a given org', async () => {
    const { storePat, deletePat, getPat } = await import('../../src/services/credential-store.js');

    await storePat('orgA', 'tokenA');
    const removed = await deletePat('orgA');

    expect(removed).toBe(true);
    expect(await getPat('orgA')).toBeNull();
  });

  it('delete returns false when no PAT exists for the org', async () => {
    const { deletePat } = await import('../../src/services/credential-store.js');
    expect(await deletePat('never-stored')).toBe(false);
  });

  it('emits auth.store audit event on storePat', async () => {
    const { storePat } = await import('../../src/services/credential-store.js');

    await storePat('orgA', 'tokenA');

    expect(appendAuthAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.store', org: 'orgA' }),
    );
  });

  it('emits auth.delete audit event on deletePat', async () => {
    const { storePat, deletePat } = await import('../../src/services/credential-store.js');

    await storePat('orgA', 'tokenA');
    appendAuthAuditEventMock.mockClear();
    await deletePat('orgA');

    expect(appendAuthAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.delete', org: 'orgA' }),
    );
  });

  it('throws CredentialStoreUnavailableError when backend is unreachable', async () => {
    state.backendAvailable = false;
    const { getPat } = await import('../../src/services/credential-store.js');
    const { CredentialStoreUnavailableError } = await import('../../src/types/credential.js');

    await expect(getPat('orgA')).rejects.toBeInstanceOf(CredentialStoreUnavailableError);
  });

  it('throws CredentialStoreUnavailableError when keyring Entry constructor itself fails', async () => {
    state.constructorThrows = true;
    const { getStoredCredential, storePat, storeOAuthCredential, deletePat } = await import(
      '../../src/services/credential-store.js'
    );
    const { CredentialStoreUnavailableError } = await import('../../src/types/credential.js');

    await expect(getStoredCredential('orgA')).rejects.toBeInstanceOf(CredentialStoreUnavailableError);
    await expect(storePat('orgA', 'tok')).rejects.toBeInstanceOf(CredentialStoreUnavailableError);
    await expect(deletePat('orgA')).rejects.toBeInstanceOf(CredentialStoreUnavailableError);
    await expect(
      storeOAuthCredential('orgA', {
        kind: 'oauth',
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: 1,
        issuedAt: 0,
        accountId: 'id',
        scope: 's',
        tenantId: 't',
      }),
    ).rejects.toBeInstanceOf(CredentialStoreUnavailableError);
  });

  it('migrates legacy single-slot PAT to pat:<config.org> on first getPat when config.org is set', async () => {
    state.entries.set('azdo-cli::pat', 'legacy-token');
    loadConfigMock.mockReturnValue({ org: 'defaultorg' });

    const { getPat } = await import('../../src/services/credential-store.js');

    const result = await getPat('defaultorg');
    expect(result).toBe('legacy-token');
    expect(state.entries.has('azdo-cli::pat')).toBe(false);
    expect(state.entries.get('azdo-cli::pat:defaultorg')).toBe('legacy-token');
  });

  it('does not migrate legacy slot when config.org is unset', async () => {
    state.entries.set('azdo-cli::pat', 'legacy-token');
    loadConfigMock.mockReturnValue({});

    const { getPat } = await import('../../src/services/credential-store.js');

    const result = await getPat('requested-org');
    expect(result).toBeNull();
    expect(state.entries.has('azdo-cli::pat')).toBe(true);
  });

  it('does not migrate legacy slot when a per-org slot already exists', async () => {
    state.entries.set('azdo-cli::pat', 'legacy-token');
    state.entries.set('azdo-cli::pat:defaultorg', 'already-migrated');
    loadConfigMock.mockReturnValue({ org: 'defaultorg' });

    const { getPat } = await import('../../src/services/credential-store.js');

    expect(await getPat('defaultorg')).toBe('already-migrated');
    expect(state.entries.has('azdo-cli::pat')).toBe(true);
  });

  it('listOrgsWithStoredPat enumerates via audit log and filters by present vault entries', async () => {
    readAuditEventsMock.mockReturnValue([
      { event: 'auth.store', org: 'orgA', ts: '2026-04-01T00:00:00Z', backend: 'linux-libsecret' },
      { event: 'auth.store', org: 'orgB', ts: '2026-04-02T00:00:00Z', backend: 'linux-libsecret' },
      { event: 'auth.delete', org: 'orgB', ts: '2026-04-03T00:00:00Z', backend: 'linux-libsecret' },
      { event: 'auth.store', org: 'orgC', ts: '2026-04-04T00:00:00Z', backend: 'linux-libsecret' },
    ]);
    state.entries.set('azdo-cli::pat:orgA', 'tA');
    state.entries.set('azdo-cli::pat:orgC', 'tC');

    const { listOrgsWithStoredPat } = await import('../../src/services/credential-store.js');

    const orgs = await listOrgsWithStoredPat();
    expect(orgs).toEqual(['orgA', 'orgC']);
  });
});
