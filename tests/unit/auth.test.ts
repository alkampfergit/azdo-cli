import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const getPatMock = vi.fn();

vi.mock('../../src/services/credential-store.js', () => ({
  getPat: getPatMock,
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
    getPatMock.mockResolvedValue('stored-token');

    const auth = await import('../../src/services/auth.js');
    const result = await auth.resolvePat('orgA');

    expect(result).toEqual({ pat: 'env-token', source: 'env' });
    expect(getPatMock).not.toHaveBeenCalled();
  });

  it('falls through env -> stored for the requested org', async () => {
    getPatMock.mockResolvedValue('stored-token');

    const auth = await import('../../src/services/auth.js');
    const result = await auth.resolvePat('orgA');

    expect(result).toEqual({ pat: 'stored-token', source: 'credential-store' });
    expect(getPatMock).toHaveBeenCalledWith('orgA');
  });

  it('falls through env -> stored -> .env file', async () => {
    getPatMock.mockResolvedValue(null);
    existsSyncMock.mockImplementation((p) => String(p).endsWith('.env'));
    readFileSyncMock.mockReturnValue('AZDO_PAT=dotenv-token\n');

    const auth = await import('../../src/services/auth.js');
    const result = await auth.resolvePat('orgA');

    expect(result).toEqual({ pat: 'dotenv-token', source: 'env' });
  });

  it('returns null when nothing is available (no prompt fallback)', async () => {
    getPatMock.mockResolvedValue(null);

    const auth = await import('../../src/services/auth.js');
    const result = await auth.resolvePat('orgA');

    expect(result).toBeNull();
  });

  it('treats an empty AZDO_PAT env var as unset', async () => {
    process.env.AZDO_PAT = '';
    getPatMock.mockResolvedValue('stored-token');

    const auth = await import('../../src/services/auth.js');
    const result = await auth.resolvePat('orgA');

    expect(result).toEqual({ pat: 'stored-token', source: 'credential-store' });
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
    getPatMock.mockResolvedValue(null);
    const auth = await import('../../src/services/auth.js');
    await expect(auth.requirePat('orgA')).rejects.toThrow(/azdo auth --org orgA/);
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
