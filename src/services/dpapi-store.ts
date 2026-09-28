import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CredentialStoreUnavailableError } from '../types/credential.js';
import { loadDpapi } from './dpapi-binding.js';

const BACKEND = 'windows-dpapi';
const FILENAME_UNSAFE = /[^A-Za-z0-9_.-]/g;

/** The same get/set/delete surface as a `@napi-rs/keyring` Entry. */
export interface SecretEntry {
  getPassword(): string | null;
  setPassword(value: string): void;
  deletePassword(): boolean;
}

export function dpapiCredentialsDir(): string {
  return path.join(os.homedir(), '.azdo', 'credentials');
}

/**
 * One file per keyring account. Characters outside [A-Za-z0-9_.-] (the `:` in
 * `pat:<org>` included) become `_XX` hex escapes, so the mapping stays
 * reversible and two orgs can never collide on one file.
 */
export function dpapiFilePath(account: string): string {
  const safe = account.replaceAll(FILENAME_UNSAFE, (ch) => `_${ch.codePointAt(0)!.toString(16)}`);
  return path.join(dpapiCredentialsDir(), `${safe}.dpapi`);
}

// Entropy ties a blob to its slot: a file copied over another org's file fails
// to decrypt instead of silently authenticating as the wrong org.
function entropyFor(account: string): Uint8Array {
  return Buffer.from(`azdo-cli:${account}`, 'utf8');
}

function unavailable(cause: unknown, message: string): CredentialStoreUnavailableError {
  return new CredentialStoreUnavailableError(BACKEND, cause, message);
}

function binding() {
  try {
    return loadDpapi();
  } catch (err) {
    throw unavailable(
      err,
      `DPAPI credential store unavailable: ${(err as Error).message}. ` +
        'Reinstall azdo-cli, or switch back with `azdo config set credentialStore keyring`.',
    );
  }
}

function isNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === 'ENOENT';
}

/**
 * A credential slot backed by a DPAPI-protected file under
 * `~/.azdo/credentials`, encrypted at `CurrentUser` scope: only this Windows
 * user can decrypt it. For hosts where Credential Manager is unreachable —
 * notably OpenSSH sessions, which get no credential vault.
 */
export class DpapiEntry implements SecretEntry {
  private readonly file: string;

  constructor(private readonly account: string) {
    this.file = dpapiFilePath(account);
  }

  getPassword(): string | null {
    let blob: Buffer;
    try {
      blob = fs.readFileSync(this.file);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw unavailable(err, `Could not read the DPAPI credential file ${this.file}: ${(err as Error).message}`);
    }
    try {
      const plain = binding().unprotectData(blob, entropyFor(this.account), 'CurrentUser');
      return Buffer.from(plain).toString('utf8');
    } catch (err) {
      if (err instanceof CredentialStoreUnavailableError) throw err;
      throw unavailable(
        err,
        `Could not decrypt the DPAPI credential file ${this.file}: ${(err as Error).message}. ` +
          'It was written by another Windows user, on another machine, or from a logon session without ' +
          'access to your DPAPI master key. Run `azdo auth login` again from this session to replace it.',
      );
    }
  }

  setPassword(value: string): void {
    const dpapi = binding();
    const entropy = entropyFor(this.account);
    let blob: Uint8Array;
    try {
      blob = dpapi.protectData(Buffer.from(value, 'utf8'), entropy, 'CurrentUser');
      // Round-trip before writing: some logon sessions (e.g. an OpenSSH
      // public-key logon) can encrypt but not decrypt, and a blob nobody can
      // read back is worse than failing now.
      const check = Buffer.from(dpapi.unprotectData(blob, entropy, 'CurrentUser')).toString('utf8');
      if (check !== value) throw new Error('decrypted value does not match');
    } catch (err) {
      throw unavailable(
        err,
        `DPAPI could not protect the credential in this session: ${(err as Error).message}. Nothing was stored. ` +
          'Over SSH this usually means the logon has no access to your DPAPI master key (common with ' +
          'public-key authentication); log in with a password, or use AZDO_PAT for this session.',
      );
    }
    const tmp = `${this.file}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(dpapiCredentialsDir(), { recursive: true, mode: 0o700 });
      // Write-then-rename so a crash never leaves a half-written blob behind.
      fs.writeFileSync(tmp, blob, { mode: 0o600 });
      fs.renameSync(tmp, this.file);
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      throw unavailable(err, `Could not write the DPAPI credential file ${this.file}: ${(err as Error).message}`);
    }
  }

  deletePassword(): boolean {
    try {
      fs.unlinkSync(this.file);
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw unavailable(err, `Could not delete the DPAPI credential file ${this.file}: ${(err as Error).message}`);
    }
  }
}
