import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AuthCredential } from '../types/work-item.js';
import { getPat } from './credential-store.js';
import { maskedDisplay, normalizePat } from './auth-masking.js';

export { maskedDisplay, normalizePat };

const PAT_PROMPT = 'Enter your Azure DevOps PAT: ';

export async function promptForPat(): Promise<string | null> {
  if (!process.stdin.isTTY) {
    return null;
  }

  return new Promise<string | null>((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output: null as any,
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

export async function resolvePat(org: string): Promise<AuthCredential | null> {
  const envPat = process.env.AZDO_PAT;
  if (envPat && envPat.length > 0) {
    return { pat: envPat, source: 'env' };
  }

  const storedPat = await getPat(org);
  if (storedPat !== null) {
    return { pat: storedPat, source: 'credential-store' };
  }

  const dotEnvPat = findDotEnvPat();
  if (dotEnvPat !== null) {
    return { pat: dotEnvPat, source: 'env' };
  }

  return null;
}

export async function requirePat(org: string): Promise<AuthCredential> {
  const cred = await resolvePat(org);
  if (cred !== null) {
    return cred;
  }
  throw new Error(
    `No PAT available for org "${org}". Set AZDO_PAT environment variable or run \`azdo auth --org ${org}\`.`,
  );
}

export interface ValidatePatResult {
  ok: boolean;
  status: number;
}

export async function validatePatAgainstAzdo(pat: string, org: string): Promise<ValidatePatResult> {
  const url = `https://dev.azure.com/${encodeURIComponent(org)}/_apis/projects?$top=1&api-version=7.1`;
  const auth = Buffer.from(`:${pat}`).toString('base64');
  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  });
  if (response.status === 200) {
    return { ok: true, status: 200 };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: response.status };
  }
  throw new Error(`Azure DevOps returned HTTP ${response.status} while validating PAT for org "${org}".`);
}

