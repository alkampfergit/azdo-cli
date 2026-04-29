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

import { resolveOAuthConfig, validateRedirectUri, defaultScopes, DEFAULT_OAUTH_CLIENT_ID, AZDO_RESOURCE_ID } from '../../src/services/oauth-config.js';
import { loadConfig } from '../../src/services/config-store.js';

describe('oauth-config — resolution precedence (FR-013, FR-016)', () => {
  beforeEach(() => {
    delete process.env.AZDO_OAUTH_CLIENT_ID;
    delete process.env.AZDO_OAUTH_TENANT_ID;
    vi.mocked(loadConfig).mockReset().mockReturnValue({});
  });

  afterEach(() => {
    delete process.env.AZDO_OAUTH_CLIENT_ID;
    delete process.env.AZDO_OAUTH_TENANT_ID;
    vi.restoreAllMocks();
  });

  it('uses the default shipped client id when nothing else is set', () => {
    const cfg = resolveOAuthConfig();
    expect(cfg.clientId).toBe(DEFAULT_OAUTH_CLIENT_ID);
    expect(cfg.clientIdSource).toBe('default');
    expect(cfg.tenantId).toBe('common');
  });

  it('env AZDO_OAUTH_CLIENT_ID overrides the default', () => {
    process.env.AZDO_OAUTH_CLIENT_ID = 'env-client-id';
    const cfg = resolveOAuthConfig();
    expect(cfg.clientId).toBe('env-client-id');
    expect(cfg.clientIdSource).toBe('env');
  });

  it('config file oauth.clientId overrides the default but loses to env', () => {
    vi.mocked(loadConfig).mockReturnValue({ oauth: { clientId: 'cfg-id' } } as ReturnType<typeof loadConfig>);
    const cfg = resolveOAuthConfig();
    expect(cfg.clientId).toBe('cfg-id');
    expect(cfg.clientIdSource).toBe('config');

    process.env.AZDO_OAUTH_CLIENT_ID = 'env-id';
    const cfg2 = resolveOAuthConfig();
    expect(cfg2.clientId).toBe('env-id');
    expect(cfg2.clientIdSource).toBe('env');
  });

  it('clientIdOverride wins over env and config', () => {
    process.env.AZDO_OAUTH_CLIENT_ID = 'env-id';
    vi.mocked(loadConfig).mockReturnValue({ oauth: { clientId: 'cfg-id' } } as ReturnType<typeof loadConfig>);
    const cfg = resolveOAuthConfig({ clientIdOverride: 'flag-id' });
    expect(cfg.clientId).toBe('flag-id');
    expect(cfg.clientIdSource).toBe('flag');
  });

  it('tenantId resolution mirrors clientId precedence', () => {
    process.env.AZDO_OAUTH_TENANT_ID = 'env-tenant';
    const cfg = resolveOAuthConfig();
    expect(cfg.tenantId).toBe('env-tenant');
    const cfg2 = resolveOAuthConfig({ tenantIdOverride: 'flag-tenant' });
    expect(cfg2.tenantId).toBe('flag-tenant');
  });

  it('default scopes use the AzDO resource .default scope (first-party-client preauth path)', () => {
    const cfg = resolveOAuthConfig();
    expect(cfg.scopes).toContain(`${AZDO_RESOURCE_ID}/.default`);
    expect(cfg.scopes).toContain('offline_access');
    expect(cfg.scopes).toContain('openid');
    expect(cfg.scopes).not.toContain(`${AZDO_RESOURCE_ID}/vso.full_access`);
  });

  it('scopesOverride replaces the default scope set', () => {
    const cfg = resolveOAuthConfig({ scopesOverride: ['custom-scope-1'] });
    expect(cfg.scopes).toEqual(['custom-scope-1']);
  });

  it('exposes the Entra v2 endpoints derived from tenantId', () => {
    const cfg = resolveOAuthConfig({ tenantIdOverride: 'mytenant' });
    expect(cfg.authorizationEndpoint).toBe('https://login.microsoftonline.com/mytenant/oauth2/v2.0/authorize');
    expect(cfg.tokenEndpoint).toBe('https://login.microsoftonline.com/mytenant/oauth2/v2.0/token');
    expect(cfg.deviceCodeEndpoint).toBe('https://login.microsoftonline.com/mytenant/oauth2/v2.0/devicecode');
  });
});

describe('oauth-config — validateRedirectUri (loopback only, FR-013a)', () => {
  it('accepts http://127.0.0.1:<port>/callback', () => {
    expect(validateRedirectUri('http://127.0.0.1:50231/callback')).toBe(true);
    expect(validateRedirectUri('http://127.0.0.1:65535/callback')).toBe(true);
  });

  it('accepts http://localhost:<port> (used with Microsoft first-party clients)', () => {
    expect(validateRedirectUri('http://localhost:50231')).toBe(true);
    expect(validateRedirectUri('http://localhost:50231/callback')).toBe(true);
    expect(validateRedirectUri('http://127.0.0.1:50231')).toBe(true);
  });

  it('rejects 0.0.0.0 and other non-loopback hosts', () => {
    // RFC 8252 mandates plaintext http for native OAuth loopback redirects;
    // these are CLI-internal validation fixtures, not real network calls.
    expect(validateRedirectUri('http://0.0.0.0:50231/callback')).toBe(false); // NOSONAR — see comment above
    expect(validateRedirectUri('http://example.com:50231/callback')).toBe(false); // NOSONAR — same
  });

  it('rejects HTTPS (loopback is plaintext per RFC 8252)', () => {
    expect(validateRedirectUri('https://127.0.0.1:50231/callback')).toBe(false);
  });

  it('rejects non-/callback paths', () => {
    expect(validateRedirectUri('http://127.0.0.1:50231/auth')).toBe(false);
    expect(validateRedirectUri('http://127.0.0.1:50231/')).toBe(false);
  });

  it('rejects when port is missing', () => {
    expect(validateRedirectUri('http://127.0.0.1/callback')).toBe(false);
  });
});

describe('oauth-config — defaultScopes', () => {
  it('returns the FR-016 baseline as a stable readonly array', () => {
    const a = defaultScopes();
    const b = defaultScopes();
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });
});
