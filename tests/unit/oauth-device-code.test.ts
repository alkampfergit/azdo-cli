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
  DeviceCodeFlowError,
  pollForDeviceToken,
  requestDeviceCode,
  runDeviceCodeFlow,
} from '../../src/services/oauth-device-code.js';
import { resolveOAuthConfig } from '../../src/services/oauth-config.js';

describe('oauth-device-code — request /devicecode', () => {
  beforeEach(() => {
    delete process.env.AZDO_OAUTH_CLIENT_ID;
  });
  afterEach(() => {
    delete process.env.AZDO_OAUTH_CLIENT_ID;
  });

  it('posts client_id + scope to the device-code endpoint and parses the response', async () => {
    const oauthConfig = resolveOAuthConfig({ clientIdOverride: 'cid' });
    const calls: { url: string; body: string }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      const bodyAsString = typeof init.body === 'string' ? init.body : init.body?.toString() ?? '';
      calls.push({ url, body: bodyAsString });
      return new Response(
        JSON.stringify({
          user_code: 'ABC-DEF-GH',
          device_code: 'dc-secret',
          verification_uri: 'https://microsoft.com/devicelogin',
          expires_in: 900,
          interval: 5,
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const dc = await requestDeviceCode(oauthConfig, fetchFn);
    expect(dc.user_code).toBe('ABC-DEF-GH');
    expect(dc.device_code).toBe('dc-secret');
    expect(dc.expires_in).toBe(900);
    expect(dc.interval).toBe(5);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(oauthConfig.deviceCodeEndpoint);
    expect(calls[0].body).toContain('client_id=cid');
    expect(calls[0].body).toContain('scope=');
  });

  it('throws DeviceCodeFlowError on a non-OK response', async () => {
    const oauthConfig = resolveOAuthConfig({ clientIdOverride: 'cid' });
    const fetchFn = (async () =>
      new Response(JSON.stringify({ error: 'invalid_client', error_description: 'bad cid' }), { status: 401 })) as unknown as typeof fetch;
    await expect(requestDeviceCode(oauthConfig, fetchFn)).rejects.toBeInstanceOf(DeviceCodeFlowError);
  });
});

describe('oauth-device-code — pollForDeviceToken (RFC 8628)', () => {
  it('returns a TokenResponse on first success', async () => {
    const oauthConfig = resolveOAuthConfig({ clientIdOverride: 'cid' });
    const fetchFn = (async () =>
      new Response(
        JSON.stringify({ access_token: 'access', token_type: 'Bearer', expires_in: 3600 }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const sleep = vi.fn(async () => undefined);
    const r = await pollForDeviceToken('dc', oauthConfig, 1, Date.now() + 60_000, {
      fetch: fetchFn,
      sleep,
      now: () => Date.now(),
    });
    expect(r.access_token).toBe('access');
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('keeps polling on authorization_pending without changing the interval', async () => {
    const oauthConfig = resolveOAuthConfig({ clientIdOverride: 'cid' });
    let n = 0;
    const fetchFn = (async () => {
      n += 1;
      if (n < 3) {
        return new Response(JSON.stringify({ error: 'authorization_pending' }), { status: 400 });
      }
      return new Response(
        JSON.stringify({ access_token: 'access', token_type: 'Bearer', expires_in: 3600 }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const intervals: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      intervals.push(ms);
    });
    const r = await pollForDeviceToken('dc', oauthConfig, 5, Date.now() + 60_000, {
      fetch: fetchFn,
      sleep,
      now: () => Date.now(),
    });
    expect(r.access_token).toBe('access');
    expect(intervals).toEqual([5000, 5000, 5000]);
  });

  it('extends the interval by 5s on slow_down (RFC 8628 §3.5)', async () => {
    const oauthConfig = resolveOAuthConfig({ clientIdOverride: 'cid' });
    let n = 0;
    const fetchFn = (async () => {
      n += 1;
      if (n === 1) return new Response(JSON.stringify({ error: 'slow_down' }), { status: 400 });
      if (n === 2) return new Response(JSON.stringify({ error: 'slow_down' }), { status: 400 });
      return new Response(
        JSON.stringify({ access_token: 'a', token_type: 'Bearer', expires_in: 3600 }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const intervals: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      intervals.push(ms);
    });
    await pollForDeviceToken('dc', oauthConfig, 5, Date.now() + 60_000, {
      fetch: fetchFn,
      sleep,
      now: () => Date.now(),
    });
    // Initial 5s, slow_down → 10s, another slow_down → 15s
    expect(intervals).toEqual([5000, 10000, 15000]);
  });

  it('throws expired_token when the device-code window elapses', async () => {
    const oauthConfig = resolveOAuthConfig({ clientIdOverride: 'cid' });
    const fetchFn = (async () =>
      new Response(JSON.stringify({ error: 'expired_token' }), { status: 400 })) as unknown as typeof fetch;
    await expect(
      pollForDeviceToken('dc', oauthConfig, 1, Date.now() + 60_000, {
        fetch: fetchFn,
        sleep: async () => undefined,
        now: () => Date.now(),
      }),
    ).rejects.toMatchObject({ reason: 'expired_token' });
  });

  it('throws when local time exceeds expiresAtMs even before the IdP returns expired_token', async () => {
    const oauthConfig = resolveOAuthConfig({ clientIdOverride: 'cid' });
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'authorization_pending' }), { status: 400 })) as unknown as typeof fetch;
    let now = 1000;
    await expect(
      pollForDeviceToken('dc', oauthConfig, 1, 1500, {
        fetch: fetchFn,
        sleep: async () => undefined,
        now: () => {
          now += 1000;
          return now;
        },
      }),
    ).rejects.toMatchObject({ reason: 'expired_token' });
  });

  it('throws access_denied on user denial', async () => {
    const oauthConfig = resolveOAuthConfig({ clientIdOverride: 'cid' });
    const fetchFn = (async () =>
      new Response(JSON.stringify({ error: 'access_denied' }), { status: 400 })) as unknown as typeof fetch;
    await expect(
      pollForDeviceToken('dc', oauthConfig, 1, Date.now() + 60_000, {
        fetch: fetchFn,
        sleep: async () => undefined,
        now: () => Date.now(),
      }),
    ).rejects.toMatchObject({ reason: 'access_denied' });
  });
});

describe('oauth-device-code — runDeviceCodeFlow end-to-end', () => {
  it('prints user_code + verification_uri to the writePrompt sink and returns a credential on success', async () => {
    const oauthConfig = resolveOAuthConfig({ clientIdOverride: 'cid' });
    let phase: 'request' | 'token' = 'request';
    const fetchFn = (async (url: string) => {
      if (url === oauthConfig.deviceCodeEndpoint) {
        phase = 'token';
        return new Response(
          JSON.stringify({
            user_code: 'AAAA-BBBB',
            device_code: 'dc-secret',
            verification_uri: 'https://microsoft.com/devicelogin',
            expires_in: 600,
            interval: 1,
          }),
          { status: 200 },
        );
      }
      if (phase === 'token' && url === oauthConfig.tokenEndpoint) {
        return new Response(
          JSON.stringify({ access_token: 'access', token_type: 'Bearer', expires_in: 3600, refresh_token: 'r' }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected url: ${url}`);
    }) as unknown as typeof fetch;

    const prompts: string[] = [];
    const r = await runDeviceCodeFlow('orgA', oauthConfig, {
      fetch: fetchFn,
      sleep: async () => undefined,
      now: () => Date.now(),
      writePrompt: (m) => prompts.push(m),
    });
    expect(r.flowUsed).toBe('device-code');
    expect(r.credential.kind).toBe('oauth');
    expect(r.credential.accessToken).toBe('access');
    const promptText = prompts.join('');
    expect(promptText).toContain('AAAA-BBBB');
    expect(promptText).toContain('https://microsoft.com/devicelogin');
  });
});
