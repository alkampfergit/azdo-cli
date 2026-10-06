import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const script = resolve(__dirname, '../../scripts/compute-version.sh');
let repo: string;

function run(...args: string[]) {
  return spawnSync('bash', [script, ...args], { cwd: repo, encoding: 'utf8' });
}

function parse(stdout: string): Record<string, string> {
  return Object.fromEntries(stdout.trim().split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2)));
}

describe('scripts/compute-version.sh', () => {
  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'compute-version-'));
    const git = (...a: string[]) => execFileSync('git', a, { cwd: repo });
    git('init', '-q');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-qm', 'x');
    for (const t of ['0.9.0', 'v0.13.0', '0.13.1-rc.1']) git('tag', t);
  });

  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it('--pr derives the base from the latest clean tag and uses a pr-<n> dist-tag', () => {
    const r = run('--pr', '134', '57');
    expect(r.status).toBe(0);
    const out = parse(r.stdout);
    expect(out.version).toBe('0.14.0-pr.134.57');
    expect(out.tag).toBe('pr-134');
  });

  it.each(['', 'abc', '12x'])('--pr rejects %j as a pull request number', (n) => {
    const r = run('--pr', n);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
  });

  it('keeps the branch modes unchanged', () => {
    expect(parse(run('develop', '3').stdout)).toMatchObject({ version: '0.14.0-develop.3', tag: 'dev' });
    expect(parse(run('release/0.14.0', '5').stdout)).toMatchObject({ version: '0.14.0-next.5', tag: 'next' });
    expect(parse(run('feature/x', '7').stdout)).toMatchObject({ version: '0.14.0-feature-x.7', tag: 'dev' });
  });
});
