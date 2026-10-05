import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractArtifactZip } from '../../src/services/artifact-extract.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'azdo-extract-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const opts = { artifactName: 'scan', force: false };

describe('extractArtifactZip', () => {
  it('extracts into the destination, stripping the artifact-name prefix, leaving no zip', () => {
    const zip = zipSync({ 'scan/report.json': strToU8('{}'), 'scan/sub/a.md': strToU8('# a') });
    const dest = path.join(dir, 'out');
    const files = extractArtifactZip(zip, dest, opts);
    expect(files.sort()).toEqual(['report.json', 'sub/a.md']);
    expect(readFileSync(path.join(dest, 'sub/a.md'), 'utf8')).toBe('# a');
    expect(readdirSync(dir)).toEqual(['out']);
    expect(readdirSync(dest).some((f) => f.endsWith('.zip'))).toBe(false);
  });

  it('rejects zip-slip entries before writing anything', () => {
    const zip = zipSync({ 'scan/ok.txt': strToU8('x'), 'scan/../../evil.txt': strToU8('x') });
    const dest = path.join(dir, 'out');
    expect(() => extractArtifactZip(zip, dest, opts)).toThrow(/escapes the destination/);
    expect(existsSync(dest)).toBe(false);
    expect(existsSync(path.join(dir, 'evil.txt'))).toBe(false);
  });

  it('refuses to overwrite without force, and overwrites with it', () => {
    const dest = path.join(dir, 'out');
    mkdirSync(dest);
    writeFileSync(path.join(dest, 'report.json'), 'old');
    const zip = zipSync({ 'scan/report.json': strToU8('new') });
    expect(() => extractArtifactZip(zip, dest, opts)).toThrow(/--force/);
    expect(readFileSync(path.join(dest, 'report.json'), 'utf8')).toBe('old');
    extractArtifactZip(zip, dest, { ...opts, force: true });
    expect(readFileSync(path.join(dest, 'report.json'), 'utf8')).toBe('new');
  });
});
