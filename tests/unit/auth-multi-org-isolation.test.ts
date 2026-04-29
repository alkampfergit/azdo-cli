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

vi.mock('../../src/services/audit-log.js', () => ({
  appendAuthAuditEvent: vi.fn(),
  getAuditLogPath: () => '/private/azdo-test-unused-audit.log',
  readAuditEvents: vi.fn(() => []),
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

vi.mock('../../src/services/oauth-token-refresh.js', () => ({
  refreshIfNeeded: vi.fn(async (_org: string, c: { kind: 'oauth' }) => c),
}));

// Block .env discovery — the repo / parent dirs may have a real AZDO_PAT
// in a .env file that would leak into resolveAuthCredential() and break isolation tests.
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn((p: string) => {
      // Allow keyring + audit-log internal reads through; only block the
      // walk-up .env probe — but since existsSync returns false, readFileSync
      // shouldn't be called for .env. Fall through to actual for everything else.
      return actual.readFileSync(p, 'utf8') as unknown as string;
    }),
  };
});

/**
 * FR-009 — multi-org credential isolation.
 *
 * Each Azure DevOps organisation gets its own keyring slot
 * (service `azdo-cli`, account `pat:<org>`). A command targeting an
 * organisation the user is NOT authenticated against must fail with a
 * clear "log in to <org>" message; it must NEVER silently fall back to
 * a different organisation's credential.
 */
describe('FR-009 — per-org credential isolation', () => {
  beforeEach(() => {
    state.entries.clear();
    delete process.env.AZDO_PAT;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.AZDO_PAT;
  });

  it('credentials for orgA and orgB do not leak into a query for orgC', async () => {
    state.entries.set('azdo-cli::pat:orgA', JSON.stringify({ kind: 'pat', token: 'pat-A' }));
    state.entries.set(
      'azdo-cli::pat:orgB',
      JSON.stringify({
        kind: 'oauth',
        accessToken: 'access-B',
        refreshToken: 'refresh-B',
        expiresAt: Math.floor(Date.now() / 1000) + 600,
        issuedAt: Math.floor(Date.now() / 1000),
        accountId: 'oid:B',
        scope: 'vso.work',
        tenantId: 'organizations',
      }),
    );

    const { resolveAuthCredential } = await import('../../src/services/auth.js');
    const credA = await resolveAuthCredential('orgA');
    const credB = await resolveAuthCredential('orgB');
    const credC = await resolveAuthCredential('orgC');

    expect(credA).toEqual({ pat: 'pat-A', source: 'credential-store', kind: 'pat' });
    expect(credB?.kind).toBe('oauth');
    expect(credB?.pat).toBe('access-B');
    expect(credC).toBeNull();
  });

  it('requireAuthCredential throws CredentialMissingError for an unknown org rather than returning a sibling org credential', async () => {
    state.entries.set('azdo-cli::pat:orgA', JSON.stringify({ kind: 'pat', token: 'pat-A' }));

    const { requireAuthCredential } = await import('../../src/services/auth.js');
    const { CredentialMissingError } = await import('../../src/types/credential.js');
    await expect(requireAuthCredential('unknownOrg')).rejects.toBeInstanceOf(CredentialMissingError);
  });

  it('logout for orgA does not affect orgB', async () => {
    state.entries.set('azdo-cli::pat:orgA', JSON.stringify({ kind: 'pat', token: 'pat-A' }));
    state.entries.set('azdo-cli::pat:orgB', JSON.stringify({ kind: 'pat', token: 'pat-B' }));

    const { deletePat } = await import('../../src/services/credential-store.js');
    const removed = await deletePat('orgA');
    expect(removed).toBe(true);
    expect(state.entries.has('azdo-cli::pat:orgA')).toBe(false);
    expect(state.entries.get('azdo-cli::pat:orgB')).toBe(JSON.stringify({ kind: 'pat', token: 'pat-B' }));
  });

  it('mixing kinds across orgs is supported (FR-007 — coexist as first-class)', async () => {
    state.entries.set('azdo-cli::pat:patOrg', JSON.stringify({ kind: 'pat', token: 'p' }));
    state.entries.set(
      'azdo-cli::pat:oauthOrg',
      JSON.stringify({
        kind: 'oauth',
        accessToken: 'a',
        refreshToken: null,
        expiresAt: Math.floor(Date.now() / 1000) + 600,
        issuedAt: Math.floor(Date.now() / 1000),
        accountId: 'oid:x',
        scope: 'vso.work',
        tenantId: 'organizations',
      }),
    );

    const { resolveAuthCredential } = await import('../../src/services/auth.js');
    const a = await resolveAuthCredential('patOrg');
    const b = await resolveAuthCredential('oauthOrg');
    expect(a?.kind).toBe('pat');
    expect(b?.kind).toBe('oauth');
  });
});
