import { execFile } from 'node:child_process';

export type OpenResult = 'opened' | 'printed';

export interface OpenUrlOptions {
  forcePrint?: boolean;
  platform?: NodeJS.Platform;
  hasDisplay?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execFileFn?: (cmd: string, args: string[], cb: (err: Error | null) => void) => any;
}

function isHeadless(platform: NodeJS.Platform, hasDisplay: boolean): boolean {
  if (platform === 'linux') {
    return !hasDisplay;
  }
  return false;
}

function commandForPlatform(platform: NodeJS.Platform): { cmd: string; args: (url: string) => string[] } | null {
  switch (platform) {
    case 'darwin':
      return { cmd: 'open', args: (url) => [url] };
    case 'win32':
      return { cmd: 'cmd', args: (url) => ['/c', 'start', '""', url] };
    case 'linux':
      return { cmd: 'xdg-open', args: (url) => [url] };
    default:
      return null;
  }
}

export async function openUrl(url: string, opts: OpenUrlOptions = {}): Promise<OpenResult> {
  const platform = opts.platform ?? process.platform;
  const hasDisplay = opts.hasDisplay ?? (process.env.DISPLAY !== undefined && process.env.DISPLAY !== '');
  const forcePrint = opts.forcePrint ?? false;

  if (forcePrint || isHeadless(platform, hasDisplay)) {
    process.stderr.write(`Open this URL in your browser: ${url}\n`);
    return 'printed';
  }

  const spec = commandForPlatform(platform);
  if (!spec) {
    process.stderr.write(`Open this URL in your browser: ${url}\n`);
    return 'printed';
  }

  const runner =
    opts.execFileFn ??
    ((cmd, args, cb) => execFile(cmd, args, { timeout: 5000 }, (err) => cb(err)));

  return await new Promise<OpenResult>((resolve) => {
    try {
      runner(spec.cmd, spec.args(url), (err) => {
        if (err) {
          process.stderr.write(`Open this URL in your browser: ${url}\n`);
          resolve('printed');
        } else {
          resolve('opened');
        }
      });
    } catch {
      process.stderr.write(`Open this URL in your browser: ${url}\n`);
      resolve('printed');
    }
  });
}
