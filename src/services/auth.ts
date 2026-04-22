import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AuthCredential } from '../types/work-item.js';
import { getPat, storePat } from './credential-store.js';

const PAT_PROMPT = 'Enter your Azure DevOps PAT: ';
const VISIBLE_CHARS = 5;

export function normalizePat(rawPat: string): string | null {
  const trimmedPat = rawPat.trim();
  return trimmedPat.length > 0 ? trimmedPat : null;
}

export function maskedDisplay(pat: string): string {
  if (pat.length <= VISIBLE_CHARS * 2) {
    return pat;
  }
  const hiddenCount = pat.length - VISIBLE_CHARS * 2;
  return pat.slice(0, VISIBLE_CHARS) + '*'.repeat(hiddenCount) + pat.slice(-VISIBLE_CHARS);
}

export async function promptForPat(): Promise<string | null> {
  if (!process.stdin.isTTY) {
    return null;
  }

  return new Promise<string | null>((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output: null as any, // null disables readline's automatic echo
    });

    process.stderr.write(PAT_PROMPT);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    let pat = '';

    const redraw = (): void => {
      process.stderr.write(`\r${PAT_PROMPT}${maskedDisplay(pat)}\x1B[K`);
    };

    const onData = (key: Buffer): void => {
      const ch = key.toString('utf8');

      if (ch === '\u0003') {
        // Ctrl+C
        process.stdin.setRawMode(false);
        process.stdin.removeListener('data', onData);
        rl.close();
        process.stderr.write('\n');
        resolve(null);
      } else if (ch === '\r' || ch === '\n') {
        process.stdin.setRawMode(false);
        process.stdin.removeListener('data', onData);
        rl.close();
        process.stderr.write('\n');
        resolve(pat);
      } else if (ch === '\u007F' || ch === '\b') {
        if (pat.length > 0) {
          pat = pat.slice(0, -1);
          redraw();
        }
      } else {
        pat += ch;
        redraw();
      }
    };

    process.stdin.on('data', onData);
  });
}

export function findDotEnvPat(startDir: string = process.cwd()): string | null {
  let current = startDir;
  while (true) {
    const envFile = join(current, '.env');
    if (existsSync(envFile)) {
      const contents = readFileSync(envFile, 'utf8');
      for (const line of contents.split('\n')) {
        const match = line.match(/^AZDO_PAT\s*=\s*(.+)$/);
        if (match) {
          const value = match[1].trim().replace(/^["']|["']$/g, '');
          if (value.length > 0) return value;
        }
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export async function resolvePat(
  promptFn: () => Promise<string | null> = promptForPat,
): Promise<AuthCredential> {
  const envPat = process.env.AZDO_PAT;
  if (envPat) {
    return { pat: envPat, source: 'env' };
  }

  const storedPat = await getPat();
  if (storedPat !== null) {
    return { pat: storedPat, source: 'credential-store' };
  }

  const dotEnvPat = findDotEnvPat();
  if (dotEnvPat !== null) {
    return { pat: dotEnvPat, source: 'env' };
  }

  const promptedPat = await promptFn();
  if (promptedPat !== null) {
    const normalizedPat = normalizePat(promptedPat);
    if (normalizedPat !== null) {
      const saved = await storePat(normalizedPat);
      if (!saved) {
        process.stderr.write('Warning: Could not save PAT to credential store. You may need to enter it again next time.\n');
      }
      return { pat: normalizedPat, source: 'prompt' };
    }
  }

  throw new Error(
    'Authentication cancelled. Set AZDO_PAT environment variable or run again to enter a PAT.',
  );
}
