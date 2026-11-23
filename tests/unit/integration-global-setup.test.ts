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

  it.each([200, 203, 302, 401, 403])('fails on unauthenticated HTTP %s', async (status) => {
    vi.stubEnv('AZDO_API_BASE_URL', 'http://caddy:8080/azdo');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status }));

    await expect(setup()).rejects.toThrow(`proxy did not authenticate (HTTP ${status})`);
  });

  it('reports an unreachable proxy separately', async () => {
    vi.stubEnv('AZDO_API_BASE_URL', 'http://caddy:8080/azdo');
    const cause = new Error('connection refused');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(cause);

    await expect(setup()).rejects.toThrow('proxy unreachable');
  });

  it('preserves unexpected HTTP failures', async () => {
    vi.stubEnv('AZDO_API_BASE_URL', 'http://caddy:8080/azdo');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));

    await expect(setup()).rejects.toThrow('HTTP 404');
  });
});
