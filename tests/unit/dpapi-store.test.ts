import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A stand-in for CryptProtectData: XOR with a key derived from the entropy, plus
// a header carrying the entropy so a mismatched unprotect fails like DPAPI does.
const fake = vi.hoisted(() => ({
  loadThrows: false,
  unprotectThrows: false,
  unprotectCorrupts: false,
  scopes: [] as string[],
}));

vi.mock('../../src/services/dpapi-binding.js', () => {
  const MAGIC = 'FAKEDPAPI:';
  const xor = (data: Uint8Array) => Buffer.from(Array.from(data, (b) => b ^ 0x5a));
  return {
    loadDpapi: () => {
      if (fake.loadThrows) throw new Error('addon missing');
      return {
        protectData(data: Uint8Array, entropy: Uint8Array | null, scope: string) {
          fake.scopes.push(scope);
          const e = Buffer.from(entropy ?? []).toString('hex');
          return Buffer.concat([Buffer.from(`${MAGIC}${e}:`), xor(data)]);
        },
        unprotectData(blob: Uint8Array, entropy: Uint8Array | null, scope: string) {
          fake.scopes.push(scope);
          if (fake.unprotectThrows) throw new Error('Key not valid for use in specified state.');
          const text = Buffer.from(blob).toString('latin1');
          const e = Buffer.from(entropy ?? []).toString('hex');
          const header = `${MAGIC}${e}:`;
          if (!text.startsWith(header)) throw new Error('The parameter is incorrect.');
          const plain = xor(Buffer.from(blob).subarray(header.length));
          return fake.unprotectCorrupts ? Buffer.from('tampered') : plain;
        },
      };
    },
  };
});

import { DpapiEntry, dpapiCredentialsDir, dpapiFilePath } from '../../src/services/dpapi-store.js';
import { CredentialStoreUnavailableError } from '../../src/types/credential.js';

let home: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'azdo-dpapi-test-'));
  vi.spyOn(os, 'homedir').mockReturnValue(home);
  fake.loadThrows = false;
  fake.unprotectThrows = false;
  fake.unprotectCorrupts = false;
  fake.scopes = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

describe('dpapiFilePath', () => {
  it('keeps one file per account under ~/.azdo/credentials', () => {
    expect(dpapiCredentialsDir()).toBe(path.join(home, '.azdo', 'credentials'));
    expect(dpapiFilePath('pat:my-org')).toBe(path.join(home, '.azdo', 'credentials', 'pat_3amy-org.dpapi'));
  });

  it('escapes path separators so an org name cannot leave the directory', () => {
    const file = dpapiFilePath('pat:../..\\evil');
    expect(path.dirname(file)).toBe(dpapiCredentialsDir());
    expect(path.basename(file)).not.toMatch(/[/\\:]/);
  });
});

describe('DpapiEntry', () => {
  it('round-trips a value and never writes it in plaintext', () => {
    const entry = new DpapiEntry('pat:orgA');
    entry.setPassword('{"kind":"pat","token":"secret-token"}');

    const onDisk = fs.readFileSync(dpapiFilePath('pat:orgA'));
    expect(onDisk.toString('latin1')).not.toContain('secret-token');
    expect(entry.getPassword()).toBe('{"kind":"pat","token":"secret-token"}');
    expect(new Set(fake.scopes)).toEqual(new Set(['CurrentUser']));
  });

  it('returns null when nothing is stored', () => {
    expect(new DpapiEntry('pat:missing').getPassword()).toBeNull();
  });

  it('overwrites in place and leaves no temp file behind', () => {
    const entry = new DpapiEntry('pat:orgA');
    entry.setPassword('one');
    entry.setPassword('two');
    expect(entry.getPassword()).toBe('two');
    expect(fs.readdirSync(dpapiCredentialsDir())).toEqual(['pat_3aorgA.dpapi']);
  });

  it('deletes, reporting whether anything was there', () => {
    const entry = new DpapiEntry('pat:orgA');
    entry.setPassword('value');
    expect(entry.deletePassword()).toBe(true);
    expect(entry.getPassword()).toBeNull();
    expect(entry.deletePassword()).toBe(false);
  });

  it("refuses a blob copied from another org's slot (entropy binds it to its account)", () => {
    new DpapiEntry('pat:orgA').setPassword('token-for-A');
    fs.copyFileSync(dpapiFilePath('pat:orgA'), dpapiFilePath('pat:orgB'));

    expect(() => new DpapiEntry('pat:orgB').getPassword()).toThrow(CredentialStoreUnavailableError);
  });

  it('turns an undecryptable file into an actionable exit-4 error', () => {
    new DpapiEntry('pat:orgA').setPassword('value');
    fake.unprotectThrows = true;

    const read = () => new DpapiEntry('pat:orgA').getPassword();
    expect(read).toThrow(CredentialStoreUnavailableError);
    expect(read).toThrow(/Could not decrypt.*azdo auth login/s);
  });

  it('stores nothing when the session cannot decrypt what it just encrypted', () => {
    fake.unprotectThrows = true;
    const entry = new DpapiEntry('pat:orgA');

    expect(() => entry.setPassword('value')).toThrow(/Nothing was stored.*AZDO_PAT/s);
    expect(fs.existsSync(dpapiFilePath('pat:orgA'))).toBe(false);
  });

  it('stores nothing when the round-trip returns a different value', () => {
    fake.unprotectCorrupts = true;
    expect(() => new DpapiEntry('pat:orgA').setPassword('value')).toThrow(/does not match/);
    expect(fs.existsSync(dpapiFilePath('pat:orgA'))).toBe(false);
  });

  it('reports a missing addon as the store being unavailable, with no plaintext fallback', () => {
    fake.loadThrows = true;
    const entry = new DpapiEntry('pat:orgA');

    expect(() => entry.setPassword('value')).toThrow(CredentialStoreUnavailableError);
    expect(() => entry.setPassword('value')).toThrow(/DPAPI credential store unavailable: addon missing/);
    expect(fs.existsSync(dpapiCredentialsDir())).toBe(false);
  });

  it('carries the windows-dpapi backend on every error', () => {
    fake.loadThrows = true;
    try {
      new DpapiEntry('pat:orgA').setPassword('value');
      expect.unreachable();
    } catch (err) {
      expect((err as CredentialStoreUnavailableError).backend).toBe('windows-dpapi');
    }
  });
});
