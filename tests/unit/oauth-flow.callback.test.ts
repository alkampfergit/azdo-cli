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

import {
  prepareAuthCodeSession,
  buildAuthorizationUrl,
  decodeIdTokenClaims,
  tokenResponseToCredential,
  OAuthFlowError,
  openLoopbackListener,
} from '../../src/services/oauth-flow.js';
import { resolveOAuthConfig } from '../../src/services/oauth-config.js';

describe('oauth-flow — session preparation', () => {
  beforeEach(() => {
    delete process.env.AZDO_OAUTH_CLIENT_ID;
  });
  afterEach(() => {
    delete process.env.AZDO_OAUTH_CLIENT_ID;
  });

  it('rejects a non-loopback redirect URI', () => {
    const oauthConfig = resolveOAuthConfig({ clientIdOverride: 'cid' });
    expect(() =>
      prepareAuthCodeSession({
        org: 'orgA',
        oauthConfig,
        redirectUri: 'http://example.com:8080/callback',
        now: Date.now(),
        timeoutMs: 60_000,
      }),
    ).toThrow(OAuthFlowError);
  });

  it('produces a session with PKCE, state, and matching redirectUri', () => {
    const oauthConfig = resolveOAuthConfig({ clientIdOverride: 'cid' });
    const session = prepareAuthCodeSession({
      org: 'orgA',
      oauthConfig,
      redirectUri: 'http://127.0.0.1:50001/callback',
      now: Date.now(),
      timeoutMs: 60_000,
    });
    expect(session.flow).toBe('auth-code');
    expect(session.state.length).toBeGreaterThan(0);
    expect(session.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(session.codeChallenge.length).toBeGreaterThan(0);
    expect(session.redirectUri).toBe('http://127.0.0.1:50001/callback');
    expect(session.org).toBe('orgA');
    expect(session.timeoutAt).toBeGreaterThan(session.startedAt);
  });

  it('builds an authorization URL with PKCE and prompt=select_account', () => {
    const oauthConfig = resolveOAuthConfig({ clientIdOverride: 'cid' });
    const session = prepareAuthCodeSession({
      org: 'orgA',
      oauthConfig,
      redirectUri: 'http://127.0.0.1:50001/callback',
      now: Date.now(),
      timeoutMs: 60_000,
    });
    const url = buildAuthorizationUrl(session, oauthConfig);
    expect(url).toContain(oauthConfig.authorizationEndpoint);
    expect(url).toContain('response_type=code');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('prompt=select_account');
    expect(url).toContain(`state=${encodeURIComponent(session.state)}`);
    expect(url).toContain(`client_id=${encodeURIComponent('cid')}`);
    expect(url).toContain(`code_challenge=${encodeURIComponent(session.codeChallenge)}`);
  });
});

describe('oauth-flow — id_token claims + credential mapping', () => {
  it('decodes an id_token payload and prefers oid as accountId', () => {
    const claims = { oid: 'oid-123', preferred_username: 'user@x', tid: 't1' };
    const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64');
    const idToken = `eyJhbGciOiJSUzI1NiJ9.${payload}.signature`;
    const decoded = decodeIdTokenClaims(idToken);
    expect(decoded.oid).toBe('oid-123');
  });

  it('returns empty object for malformed id_tokens', () => {
    expect(decodeIdTokenClaims('not.a.token')).toEqual({});
    expect(decodeIdTokenClaims('only-one-segment')).toEqual({});
  });

  it('maps a TokenResponse to a StoredOAuthCredential with the correct lifetime', () => {
    const oauthConfig = resolveOAuthConfig({ clientIdOverride: 'cid', tenantIdOverride: 'mytenant' });
    const now = 1_745_780_000_000;
    const cred = tokenResponseToCredential('orgA', oauthConfig, {
      access_token: 'access',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'refresh',
      scope: 'vso.work offline_access',
    }, now);
    expect(cred.kind).toBe('oauth');
    expect(cred.accessToken).toBe('access');
    expect(cred.refreshToken).toBe('refresh');
    expect(cred.expiresAt).toBe(Math.floor(now / 1000) + 3600);
    expect(cred.tenantId).toBe('mytenant');
    expect(cred.scope).toBe('vso.work offline_access');
  });
});

describe('oauth-flow — loopback listener', () => {
  it('binds an OS-assigned port and rejects on path mismatch', async () => {
    const listener = await openLoopbackListener();
    expect(listener.port).toBeGreaterThan(0);
    const session = prepareAuthCodeSession({
      org: 'orgA',
      oauthConfig: resolveOAuthConfig({ clientIdOverride: 'cid' }),
      redirectUri: `http://127.0.0.1:${listener.port}/callback`,
      now: Date.now(),
      timeoutMs: 60_000,
    });
    const ac = new AbortController();
    const cbPromise = listener.awaitCallback(session, ac.signal);
    // Attach the rejection-capture handler BEFORE triggering the rejection,
    // otherwise Node may briefly observe an unhandled rejection.
    const captured = expect(cbPromise).rejects.toMatchObject({ reason: 'redirect-mismatch' });

    await fetch(`http://127.0.0.1:${listener.port}/wrong-path?state=${session.state}&code=foo`).then((r) => r.text());
    await captured;
    await listener.close();
  });

  it('rejects on state mismatch', async () => {
    const listener = await openLoopbackListener();
    const session = prepareAuthCodeSession({
      org: 'orgA',
      oauthConfig: resolveOAuthConfig({ clientIdOverride: 'cid' }),
      redirectUri: `http://127.0.0.1:${listener.port}/callback`,
      now: Date.now(),
      timeoutMs: 60_000,
    });
    const ac = new AbortController();
    const cbPromise = listener.awaitCallback(session, ac.signal);
    const captured = expect(cbPromise).rejects.toMatchObject({ reason: 'state-mismatch' });

    await fetch(`http://127.0.0.1:${listener.port}/callback?state=BAD&code=foo`).then((r) => r.text());
    await captured;
    await listener.close();
  });

  it('resolves with a code on a valid callback', async () => {
    const listener = await openLoopbackListener();
    const session = prepareAuthCodeSession({
      org: 'orgA',
      oauthConfig: resolveOAuthConfig({ clientIdOverride: 'cid' }),
      redirectUri: `http://127.0.0.1:${listener.port}/callback`,
      now: Date.now(),
      timeoutMs: 60_000,
    });
    const ac = new AbortController();
    const cbPromise = listener.awaitCallback(session, ac.signal);
    await fetch(`http://127.0.0.1:${listener.port}/callback?state=${session.state}&code=mycode`).then((r) => r.text());
    const result = await cbPromise;
    expect(result.code).toBe('mycode');
    await listener.close();
  });
});
