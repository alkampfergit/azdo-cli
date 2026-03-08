import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPatMock = vi.fn();
const storePatMock = vi.fn();

vi.mock('../../src/services/credential-store.js', () => ({
  getPat: getPatMock,
  storePat: storePatMock,
}));

describe('resolvePat', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.AZDO_PAT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns env PAT before credential store', async () => {
    process.env.AZDO_PAT = 'env-token';
    getPatMock.mockResolvedValue('stored-token');

    const auth = await import('../../src/services/auth.js');
    const result = await auth.resolvePat();

    expect(result).toEqual({ pat: 'env-token', source: 'env' });
    expect(getPatMock).not.toHaveBeenCalled();
    expect(storePatMock).not.toHaveBeenCalled();
  });

  it('does not store empty PAT entered at prompt', async () => {
    getPatMock.mockResolvedValue(null);

    const auth = await import('../../src/services/auth.js');
    vi.spyOn(auth, 'promptForPat').mockResolvedValue('');

    await expect(auth.resolvePat()).rejects.toThrow('Authentication cancelled');
    expect(storePatMock).not.toHaveBeenCalled();
  });

});

describe('normalizePat', () => {
  it('returns null for blank input', async () => {
    const auth = await import('../../src/services/auth.js');
    expect(auth.normalizePat('   ')).toBeNull();
  });

  it('trims non-empty input', async () => {
    const auth = await import('../../src/services/auth.js');
    expect(auth.normalizePat('  prompt-token  ')).toBe('prompt-token');
  });
});
