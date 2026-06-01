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

  it('uses `rundll32 url.dll,FileProtocolHandler` on win32', async () => {
    // `cmd /c start "" <url>` would let cmd.exe interpret `&` in OAuth URLs
    // as a command separator, dropping every query param after client_id.
    // rundll32 bypasses cmd entirely so the URL passes through verbatim.
    const execMock = vi.fn((_cmd: string, _args: string[], cb: (err: Error | null) => void) => {
      cb(null);
    });
    const ampUrl =
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=abc&response_type=code&scope=openid';
    const result = await openUrl(ampUrl, {
      platform: 'win32',
      execFileFn: execMock,
    });
    expect(result).toBe('opened');
    expect(execMock).toHaveBeenCalledWith(
      'rundll32',
      ['url.dll,FileProtocolHandler', ampUrl],
      expect.any(Function),
    );
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
