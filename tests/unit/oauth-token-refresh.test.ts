import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/config-store.js', () => ({
  loadConfig: vi.fn(() => ({})),
  getConfigPath: () => '/private/azdo-test-unused-config.json',
  saveConfig: vi.fn(),
  SETTINGS: [],
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
  unsetConfigValue: vi.fn(),
}));

const persistMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../../src/services/credential-store.js', () => ({
  storeOAuthCredential: persistMock,
  probeBackend: vi.fn(() => 'linux-libsecret'),
}));

vi.mock('../../src/services/audit-log.js', () => ({
  appendAuthAuditEvent: vi.fn(),
  readAuditEvents: vi.fn(() => []),
  getAuditLogPath: vi.fn(() => '/private/azdo-test-audit.log'),
}));

import { refreshIfNeeded, _resetInFlight, classifyRefreshFailure } from '../../src/services/oauth-token-refresh.js';
import { CredentialRefreshError, type StoredOAuthCredential } from '../../src/types/credential.js';

const FRESH: StoredOAuthCredential = {
  kind: 'oauth',
  accessToken: 'old-access',
  refreshToken: 'old-refresh',
  expiresAt: 0, // forced past expiry
  issuedAt: 0,
  accountId: 'oid:abc',
  scope: 'vso.work',
  tenantId: 'organizations',
};

function fakeFetch(handler: () => Response): typeof fetch {
  return (async () => handler()) as unknown as typeof fetch;
}

describe('oauth-token-refresh — single-flight + failure handling', () => {
  beforeEach(() => {
    _resetInFlight();
    persistMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips network call when access token is still within expiry margin', async () => {
    const valid: StoredOAuthCredential = { ...FRESH, expiresAt: Math.floor(Date.now() / 1000) + 600 };
    let calls = 0;
    const result = await refreshIfNeeded('orgA', valid, {
      fetch: ((async () => {
        calls += 1;
        return new Response('{}', { status: 500 });
      }) as unknown as typeof fetch),
      acquireLock: async () => ({ release: (): void => undefined }),
      now: () => Date.now(),
      persist: persistMock,
    });
    expect(calls).toBe(0);
    expect(result).toEqual(valid);
  });

  it('refreshes once and persists on success; concurrent calls coalesce to one network exchange (single-flight)', async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ access_token: 'new-access', token_type: 'Bearer', expires_in: 3600, refresh_token: 'new-refresh', scope: 'vso.work' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;
    const acquireLock = vi.fn(async () => ({ release: (): void => undefined }));

    const [a, b] = await Promise.all([
      refreshIfNeeded('orgA', FRESH, { fetch: fetchFn, acquireLock, persist: persistMock }),
      refreshIfNeeded('orgA', FRESH, { fetch: fetchFn, acquireLock, persist: persistMock }),
    ]);
    expect(calls).toBe(1);
    expect(a.accessToken).toBe('new-access');
    expect(b.accessToken).toBe('new-access');
    expect(persistMock).toHaveBeenCalledTimes(1);
  });

  it('throws CredentialRefreshError on network failure and DOES NOT delete credential', async () => {
    const fetchFn = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    await expect(
      refreshIfNeeded('orgA', FRESH, {
        fetch: fetchFn,
        acquireLock: async () => ({ release: (): void => undefined }),
        persist: persistMock,
      }),
    ).rejects.toBeInstanceOf(CredentialRefreshError);
    expect(persistMock).not.toHaveBeenCalled();
  });

  it('throws CredentialRefreshError on invalid_grant from IdP', async () => {
    const fetchFn = fakeFetch(() =>
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'expired' }), { status: 400 }),
    );
    await expect(
      refreshIfNeeded('orgA', FRESH, {
        fetch: fetchFn,
        acquireLock: async () => ({ release: (): void => undefined }),
        persist: persistMock,
      }),
    ).rejects.toBeInstanceOf(CredentialRefreshError);
    expect(persistMock).not.toHaveBeenCalled();
  });

  it('classifyRefreshFailure maps known error codes', () => {
    expect(classifyRefreshFailure({ error: 'invalid_grant' })).toBe('invalid-grant');
    expect(classifyRefreshFailure({ error: 'expired_token' })).toBe('window-exceeded');
    expect(classifyRefreshFailure({ error: 'access_denied' })).toBe('revoked');
    expect(classifyRefreshFailure({ error: 'consent_required' })).toBe('revoked');
    expect(classifyRefreshFailure({ error: 'AADSTS70008' })).toBe('window-exceeded');
    expect(classifyRefreshFailure('network')).toBe('network');
    expect(classifyRefreshFailure({ error: 'mystery' })).toBe('unknown');
  });
});
