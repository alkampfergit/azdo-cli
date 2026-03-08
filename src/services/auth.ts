import { createInterface } from 'node:readline';
import type { AuthCredential } from '../types/work-item.js';
import { getPat, storePat } from './credential-store.js';

export function normalizePat(rawPat: string): string | null {
  const trimmedPat = rawPat.trim();
  return trimmedPat.length > 0 ? trimmedPat : null;
}

export async function promptForPat(): Promise<string | null> {
  if (!process.stdin.isTTY) {
    return null;
  }

  return new Promise<string | null>((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
    });

    process.stderr.write('Enter your Azure DevOps PAT: ');
    process.stdin.setRawMode(true);
    process.stdin.resume();

    let pat = '';

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
          process.stderr.write('\b \b');
        }
      } else {
        pat += ch;
        process.stderr.write('*'.repeat(ch.length));
      }
    };

    process.stdin.on('data', onData);
  });
}

export async function resolvePat(): Promise<AuthCredential> {
  const envPat = process.env.AZDO_PAT;
  if (envPat) {
    return { pat: envPat, source: 'env' };
  }

  const storedPat = await getPat();
  if (storedPat !== null) {
    return { pat: storedPat, source: 'credential-store' };
  }

  const promptedPat = await promptForPat();
  if (promptedPat !== null) {
    const normalizedPat = normalizePat(promptedPat);
    if (normalizedPat !== null) {
      await storePat(normalizedPat);
      return { pat: normalizedPat, source: 'prompt' };
    }
  }

  throw new Error(
    'Authentication cancelled. Set AZDO_PAT environment variable or run again to enter a PAT.',
  );
}
