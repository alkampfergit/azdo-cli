import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const getPatMock = vi.fn();
const getStoredCredentialMock = vi.fn();

vi.mock('../../src/services/credential-store.js', () => ({
  getPat: getPatMock,
  getStoredCredential: getStoredCredentialMock,
  storeOAuthCredential: vi.fn(async () => undefined),
  deletePat: vi.fn(async () => false),
  listOrgsWithStoredPat: vi.fn(async () => []),
  probeBackend: vi.fn(() => 'linux-libsecret'),
}));

vi.mock('../../src/services/oauth-token-refresh.js', () => ({
  refreshIfNeeded: vi.fn(async (_org: string, c: { kind: 'oauth' }) => c),
}));

vi.mock('../../src/services/oauth-flow.js', () => ({
  runAuthCodeFlow: vi.fn(),
}));

vi.mock('../../src/services/oauth-device-code.js', () => ({
  runDeviceCodeFlow: vi.fn(),
}));

vi.mock('../../src/services/oauth-config.js', () => ({
  resolveOAuthConfig: vi.fn(() => ({
    clientId: 'cid',
    tenantId: 'organizations',
    scopes: ['vso.work', 'offline_access'],
    clientIdSource: 'default' as const,
    authorizationEndpoint: '',
    tokenEndpoint: '',
    deviceCodeEndpoint: '',
  })),
  defaultScopes: vi.fn(() => ['vso.work', 'offline_access']),
}));

vi.mock('../../src/services/audit-log.js', () => ({
  appendAuthAuditEvent: vi.fn(),
  readAuditEvents: vi.fn(() => []),
  getAuditLogPath: vi.fn(() => '/private/azdo-test-audit.log'),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

const existsSyncMock = vi.mocked(existsSync);
const readFileSyncMock = vi.mocked(readFileSync);

describe('resolvePat(org)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.AZDO_PAT;
    existsSyncMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns env PAT before hitting credential store', async () => {
    process.env.AZDO_PAT = 'env-token';
    getStoredCredentialMock.mockResolvedValue({ kind: 'pat', token: 'stored-token' });

    const auth = await import('../../src/services/auth.js');
    const result = await auth.resolvePat('orgA');

    expect(result).toEqual({ pat: 'env-token', source: 'env', kind: 'pat' });
    expect(getStoredCredentialMock).not.toHaveBeenCalled();
  });

  it('falls through env -> stored for the requested org', async () => {
    getStoredCredentialMock.mockResolvedValue({ kind: 'pat', token: 'stored-token' });

    const auth = await import('../../src/services/auth.js');
    const result = await auth.resolvePat('orgA');

    expect(result).toEqual({ pat: 'stored-token', source: 'credential-store', kind: 'pat' });
    expect(getStoredCredentialMock).toHaveBeenCalledWith('orgA');
  });

  it('falls through env -> stored -> .env file', async () => {
    getStoredCredentialMock.mockResolvedValue(null);
    existsSyncMock.mockImplementation((p) => String(p).endsWith('.env'));
    readFileSyncMock.mockReturnValue('AZDO_PAT=dotenv-token\n');

    const auth = await import('../../src/services/auth.js');
    const result = await auth.resolvePat('orgA');

    expect(result).toEqual({ pat: 'dotenv-token', source: 'env', kind: 'pat' });
  });

  it('returns null when nothing is available (no prompt fallback)', async () => {
    getStoredCredentialMock.mockResolvedValue(null);

    const auth = await import('../../src/services/auth.js');
    const result = await auth.resolvePat('orgA');

    expect(result).toBeNull();
  });

  it('treats an empty AZDO_PAT env var as unset', async () => {
    process.env.AZDO_PAT = '';
    getStoredCredentialMock.mockResolvedValue({ kind: 'pat', token: 'stored-token' });

    const auth = await import('../../src/services/auth.js');
    const result = await auth.resolvePat('orgA');

    expect(result).toEqual({ pat: 'stored-token', source: 'credential-store', kind: 'pat' });
  });

  it('returns OAuth credential with refreshed access token when stored kind is oauth', async () => {
    const stored = {
      kind: 'oauth' as const,
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: Math.floor(Date.now() / 1000) + 600,
      issuedAt: Math.floor(Date.now() / 1000),
      accountId: 'oid:abc',
      scope: 'vso.work',
      tenantId: 'organizations',
    };
    getStoredCredentialMock.mockResolvedValue(stored);

    const auth = await import('../../src/services/auth.js');
    const result = await auth.resolvePat('orgA');

    expect(result).toEqual({
      pat: 'access-1',
      source: 'credential-store',
      kind: 'oauth',
      accountId: 'oid:abc',
    });
  });
});

describe('requirePat(org)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.AZDO_PAT;
    existsSyncMock.mockReturnValue(false);
  });

  it('returns the credential when resolvePat finds one', async () => {
    process.env.AZDO_PAT = 'env-token';
    const auth = await import('../../src/services/auth.js');
    const result = await auth.requirePat('orgA');
    expect(result.pat).toBe('env-token');
  });

  it('throws a helpful message when no credential is available', async () => {
    getStoredCredentialMock.mockResolvedValue(null);
    const auth = await import('../../src/services/auth.js');
    await expect(auth.requirePat('orgA')).rejects.toThrow(/azdo auth login --org orgA/);
  });
});

describe('maskedDisplay', () => {
  it('re-exports from auth-masking', async () => {
    const auth = await import('../../src/services/auth.js');
    expect(auth.maskedDisplay('short')).toBe('short');
    expect(auth.maskedDisplay('abcdefghijklmno').length).toBe(15);
  });
});

describe('validatePatAgainstAzdo', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns ok=true on 200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 200 }) as unknown as typeof fetch;
    const auth = await import('../../src/services/auth.js');
    const result = await auth.validatePatAgainstAzdo('tok', 'myorg');
    expect(result).toEqual({ ok: true, status: 200 });
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(call[0])).toContain('dev.azure.com/myorg/_apis/projects');
    const headers = (call[1] as { headers: Record<string, string> }).headers;
    expect(headers.Authorization).toMatch(/^Basic /);
  });

  it('returns ok=false on 401', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 401 }) as unknown as typeof fetch;
    const auth = await import('../../src/services/auth.js');
    const result = await auth.validatePatAgainstAzdo('badtok', 'myorg');
    expect(result).toEqual({ ok: false, status: 401 });
  });
});
