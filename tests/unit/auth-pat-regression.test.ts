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

describe('US3 — PAT regression: existing PAT users see no behaviour change', () => {
  beforeEach(() => {
    state.entries.clear();
    delete process.env.AZDO_PAT;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.AZDO_PAT;
  });

  it('legacy bare-PAT keyring entries continue to authenticate without rewrite (FR-007)', async () => {
    // Simulate a pre-feature install: a raw-PAT string in the per-org slot
    state.entries.set('azdo-cli::pat:legacyOrg', 'pre-feature-pat-value');

    const { resolveAuthCredential } = await import('../../src/services/auth.js');
    const cred = await resolveAuthCredential('legacyOrg');

    expect(cred).toEqual({
      pat: 'pre-feature-pat-value',
      source: 'credential-store',
      kind: 'pat',
    });
    // Read path must NOT have rewritten the legacy entry — verifying the
    // FR-007 hard rule (no force-migration on read).
    expect(state.entries.get('azdo-cli::pat:legacyOrg')).toBe('pre-feature-pat-value');
  });

  it('AZDO_PAT env var still wins over a stored credential (FR-007a precedence)', async () => {
    state.entries.set('azdo-cli::pat:orgA', 'stored-pat');
    process.env.AZDO_PAT = 'env-pat';

    const { resolveAuthCredential } = await import('../../src/services/auth.js');
    const cred = await resolveAuthCredential('orgA');

    expect(cred).toEqual({ pat: 'env-pat', source: 'env', kind: 'pat' });
  });

  it('storing a fresh PAT after the upgrade wraps it in the JSON envelope', async () => {
    const { storePat } = await import('../../src/services/credential-store.js');
    await storePat('orgFresh', 'new-pat');
    expect(state.entries.get('azdo-cli::pat:orgFresh')).toBe(JSON.stringify({ kind: 'pat', token: 'new-pat' }));
  });

  it('reading a wrapped PAT envelope produces a credential identical to the legacy bare-string path', async () => {
    state.entries.set('azdo-cli::pat:orgB', JSON.stringify({ kind: 'pat', token: 'wrapped-pat' }));
    const { resolveAuthCredential } = await import('../../src/services/auth.js');
    const cred = await resolveAuthCredential('orgB');
    expect(cred).toEqual({ pat: 'wrapped-pat', source: 'credential-store', kind: 'pat' });
  });
});
