import { afterEach, describe, expect, it, vi } from 'vitest';
import setup from '../integration/global-setup.js';

vi.mock('../integration/helpers/integration-utils.js', () => ({
  AZDO_ORG: 'testorg',
  AZDO_PAT: 'placeholder',
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('integration proxy readiness', () => {
  it('does not probe when the proxy is not configured', async () => {
    vi.stubEnv('AZDO_API_BASE_URL', '');
    const fetch = vi.spyOn(globalThis, 'fetch');

    await expect(setup()).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts an authenticated JSON response', async () => {
    vi.stubEnv('AZDO_API_BASE_URL', 'http://caddy:8080/azdo');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(setup()).resolves.toBeUndefined();
  });

  it.each([200, 203, 302, 401, 403])('skips the live suites on unauthenticated HTTP %s', async (status) => {
    vi.stubEnv('AZDO_API_BASE_URL', 'http://caddy:8080/azdo');
    vi.stubEnv('AZDO_REQUIRE_PROXY', '');
    vi.stubEnv('AZDO_PAT', 'placeholder');
    vi.stubEnv('AZDO_PATH', 'placeholder');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status }));

    await expect(setup()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`proxy did not authenticate (HTTP ${status})`));
    expect(process.env.AZDO_PAT).toBe('');
    expect(process.env.AZDO_PATH).toBeUndefined();
  });

  it('skips the live suites when the proxy is unreachable', async () => {
    vi.stubEnv('AZDO_API_BASE_URL', 'http://caddy:8080/azdo');
    vi.stubEnv('AZDO_REQUIRE_PROXY', '');
    vi.stubEnv('AZDO_PAT', 'placeholder');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection refused'));

    await expect(setup()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('proxy unreachable'));
    expect(process.env.AZDO_PAT).toBe('');
  });

  it.each([200, 203, 302, 401, 403])('strict mode fails on unauthenticated HTTP %s', async (status) => {
    vi.stubEnv('AZDO_API_BASE_URL', 'http://caddy:8080/azdo');
    vi.stubEnv('AZDO_REQUIRE_PROXY', '1');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status }));

    await expect(setup()).rejects.toThrow(`proxy did not authenticate (HTTP ${status})`);
  });

  it('strict mode fails on an unreachable proxy', async () => {
    vi.stubEnv('AZDO_API_BASE_URL', 'http://caddy:8080/azdo');
    vi.stubEnv('AZDO_REQUIRE_PROXY', '1');
    const cause = new Error('connection refused');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(cause);

    await expect(setup()).rejects.toThrow('proxy unreachable');
  });

  it('fails on unexpected HTTP errors even without strict mode', async () => {
    vi.stubEnv('AZDO_API_BASE_URL', 'http://caddy:8080/azdo');
    vi.stubEnv('AZDO_REQUIRE_PROXY', '');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));

    await expect(setup()).rejects.toThrow('HTTP 404');
  });
});
