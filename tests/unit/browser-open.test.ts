import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openUrl } from '../../src/services/browser-open.js';

describe('openUrl', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses `open` on darwin', async () => {
    const execMock = vi.fn((_cmd: string, _args: string[], cb: (err: Error | null) => void) => {
      cb(null);
    });
    const result = await openUrl('https://x/y', {
      platform: 'darwin',
      execFileFn: execMock,
    });
    expect(result).toBe('opened');
    expect(execMock).toHaveBeenCalledWith('open', ['https://x/y'], expect.any(Function));
  });

  it('uses `cmd /c start` on win32', async () => {
    const execMock = vi.fn((_cmd: string, _args: string[], cb: (err: Error | null) => void) => {
      cb(null);
    });
    const result = await openUrl('https://x/y', {
      platform: 'win32',
      execFileFn: execMock,
    });
    expect(result).toBe('opened');
    expect(execMock).toHaveBeenCalledWith('cmd', ['/c', 'start', '""', 'https://x/y'], expect.any(Function));
  });

  it('uses `xdg-open` on linux with $DISPLAY set', async () => {
    const execMock = vi.fn((_cmd: string, _args: string[], cb: (err: Error | null) => void) => {
      cb(null);
    });
    const result = await openUrl('https://x/y', {
      platform: 'linux',
      hasDisplay: true,
      execFileFn: execMock,
    });
    expect(result).toBe('opened');
    expect(execMock).toHaveBeenCalledWith('xdg-open', ['https://x/y'], expect.any(Function));
  });

  it('prints URL on linux without $DISPLAY', async () => {
    const execMock = vi.fn();
    const result = await openUrl('https://x/y', {
      platform: 'linux',
      hasDisplay: false,
      execFileFn: execMock,
    });
    expect(result).toBe('printed');
    expect(execMock).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('https://x/y'));
  });

  it('falls back to print when the opener spawn fails', async () => {
    const execMock = vi.fn((_cmd: string, _args: string[], cb: (err: Error | null) => void) => {
      cb(new Error('not installed'));
    });
    const result = await openUrl('https://x/y', {
      platform: 'linux',
      hasDisplay: true,
      execFileFn: execMock,
    });
    expect(result).toBe('printed');
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('https://x/y'));
  });

  it('forcePrint skips the exec entirely', async () => {
    const execMock = vi.fn();
    const result = await openUrl('https://x/y', {
      platform: 'darwin',
      forcePrint: true,
      execFileFn: execMock,
    });
    expect(result).toBe('printed');
    expect(execMock).not.toHaveBeenCalled();
  });
});
