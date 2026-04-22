import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const getPatMock = vi.fn();
const storePatMock = vi.fn();

vi.mock('../../src/services/credential-store.js', () => ({
  getPat: getPatMock,
  storePat: storePatMock,
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

const existsSyncMock = vi.mocked(existsSync);
const readFileSyncMock = vi.mocked(readFileSync);

describe('resolvePat', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.AZDO_PAT;
    existsSyncMock.mockReturnValue(false);
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

    await expect(auth.resolvePat(() => Promise.resolve(''))).rejects.toThrow('Authentication cancelled');
    expect(storePatMock).not.toHaveBeenCalled();
  });

  it('stores PAT when prompted and credential store succeeds', async () => {
    getPatMock.mockResolvedValue(null);
    storePatMock.mockResolvedValue(true);

    const auth = await import('../../src/services/auth.js');

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await auth.resolvePat(() => Promise.resolve('prompt-token'));

    expect(result).toEqual({ pat: 'prompt-token', source: 'prompt' });
    expect(storePatMock).toHaveBeenCalledWith('prompt-token');
    expect(stderrSpy).not.toHaveBeenCalledWith(expect.stringContaining('Warning'));
    stderrSpy.mockRestore();
  });

  it('warns when PAT is prompted but credential store fails', async () => {
    getPatMock.mockResolvedValue(null);
    storePatMock.mockResolvedValue(false);

    const auth = await import('../../src/services/auth.js');

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await auth.resolvePat(() => Promise.resolve('prompt-token'));

    expect(result).toEqual({ pat: 'prompt-token', source: 'prompt' });
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Warning: Could not save PAT to credential store'));
    stderrSpy.mockRestore();
  });

  it('returns .env PAT when credential store has no PAT', async () => {
    getPatMock.mockResolvedValue(null);
    existsSyncMock.mockImplementation((p) => String(p).endsWith('.env'));
    readFileSyncMock.mockReturnValue('AZDO_PAT=dotenv-token\n');

    const auth = await import('../../src/services/auth.js');
    const result = await auth.resolvePat(() => Promise.resolve('prompt-token'));

    expect(result).toEqual({ pat: 'dotenv-token', source: 'env' });
  });

  it('falls through to prompt when .env has no AZDO_PAT', async () => {
    getPatMock.mockResolvedValue(null);
    storePatMock.mockResolvedValue(true);
    existsSyncMock.mockImplementation((p) => String(p).endsWith('.env'));
    readFileSyncMock.mockReturnValue('SOME_OTHER_VAR=value\n');

    const auth = await import('../../src/services/auth.js');
    const result = await auth.resolvePat(() => Promise.resolve('prompt-token'));

    expect(result).toEqual({ pat: 'prompt-token', source: 'prompt' });
  });

});

describe('findDotEnvPat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns PAT from .env in the given directory', async () => {
    existsSyncMock.mockImplementation((p) => String(p).endsWith('.env'));
    readFileSyncMock.mockReturnValue('AZDO_PAT=my-pat\n');

    const { findDotEnvPat } = await import('../../src/services/auth.js');
    expect(findDotEnvPat('/some/dir')).toBe('my-pat');
  });

  it('strips surrounding quotes from PAT value', async () => {
    existsSyncMock.mockImplementation((p) => String(p).endsWith('.env'));
    readFileSyncMock.mockReturnValue('AZDO_PAT="quoted-pat"\n');

    const { findDotEnvPat } = await import('../../src/services/auth.js');
    expect(findDotEnvPat('/some/dir')).toBe('quoted-pat');
  });

  it('returns null when no .env file is found', async () => {
    existsSyncMock.mockReturnValue(false);

    const { findDotEnvPat } = await import('../../src/services/auth.js');
    expect(findDotEnvPat('/some/dir')).toBeNull();
  });

  it('returns null when .env exists but has no AZDO_PAT', async () => {
    existsSyncMock.mockImplementation((p) => String(p).endsWith('.env'));
    readFileSyncMock.mockReturnValue('OTHER_VAR=value\n');

    const { findDotEnvPat } = await import('../../src/services/auth.js');
    expect(findDotEnvPat('/some/dir')).toBeNull();
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

describe('maskedDisplay', () => {
  it('shows full value when length is equal to visible chars * 2', async () => {
    const { maskedDisplay } = await import('../../src/services/auth.js');
    expect(maskedDisplay('abcdefghij')).toBe('abcdefghij');
  });

  it('shows full value when shorter than visible chars * 2', async () => {
    const { maskedDisplay } = await import('../../src/services/auth.js');
    expect(maskedDisplay('abc')).toBe('abc');
  });

  it('masks middle characters when longer than visible chars * 2', async () => {
    const { maskedDisplay } = await import('../../src/services/auth.js');
    // 21 chars: first 5 + 11 asterisks + last 5
    expect(maskedDisplay('abcdefghijklmnopqrstu')).toBe('abcde***********qrstu');
  });

  it('returns empty string unchanged', async () => {
    const { maskedDisplay } = await import('../../src/services/auth.js');
    expect(maskedDisplay('')).toBe('');
  });
});

describe('promptForPat', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('node:readline');
  });

  it('returns null when stdin is not a TTY', async () => {
    const mockCreateInterface = vi.fn(() => ({ close: vi.fn() }));
    vi.doMock('node:readline', () => ({ createInterface: mockCreateInterface }));
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

    const { promptForPat } = await import('../../src/services/auth.js');
    const result = await promptForPat();
    expect(result).toBeNull();
    expect(mockCreateInterface).not.toHaveBeenCalled();
  });

  it('creates readline interface with output: null to disable echo and resolves with entered text', async () => {
    const mockClose = vi.fn();
    const mockCreateInterface = vi.fn(() => ({ close: mockClose }));
    vi.doMock('node:readline', () => ({ createInterface: mockCreateInterface }));

    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    // Always define setRawMode so it can be spied on consistently in test environments
    Object.defineProperty(process.stdin, 'setRawMode', {
      value: vi.fn().mockReturnValue(process.stdin),
      writable: true,
      configurable: true,
    });
    const setRawModeSpy = vi.spyOn(process.stdin as NodeJS.ReadStream, 'setRawMode');

    vi.spyOn(process.stdin, 'resume').mockReturnValue(process.stdin);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process.stdin, 'removeListener').mockReturnValue(process.stdin);

    let capturedHandler: ((key: Buffer) => void) | undefined;
    vi.spyOn(process.stdin, 'on').mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'data') capturedHandler = handler as (key: Buffer) => void;
      return process.stdin;
    });

    const { promptForPat } = await import('../../src/services/auth.js');
    const promptPromise = promptForPat();

    // The Promise constructor runs synchronously, so capturedHandler is set before we await
    expect(capturedHandler).toBeDefined();
    capturedHandler!(Buffer.from('my-pat'));
    capturedHandler!(Buffer.from('\r'));

    const result = await promptPromise;

    expect(result).toBe('my-pat');
    expect(mockCreateInterface).toHaveBeenCalledWith(
      expect.objectContaining({ input: process.stdin, output: null }),
    );
    // Verify raw mode is enabled for input then disabled on completion
    expect(setRawModeSpy).toHaveBeenCalledWith(true);
    expect(setRawModeSpy).toHaveBeenCalledWith(false);
  });
});
