import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthCommand } from '../../src/commands/auth.js';
import {
  createCommandRunner,
  getStderr,
  getStdout,
  setupProcessSpies,
} from './helpers/command-test-utils.js';

const credStoreState = vi.hoisted(() => ({
  stored: new Map<string, string>(),
  listReturns: [] as string[],
}));

vi.mock('../../src/services/credential-store.js', () => ({
  getPat: vi.fn(async (org: string) => (credStoreState.stored.has(org) ? credStoreState.stored.get(org)! : null)),
  getStoredCredential: vi.fn(async (org: string) =>
    credStoreState.stored.has(org)
      ? { kind: 'pat' as const, token: credStoreState.stored.get(org)! }
      : null,
  ),
  storePat: vi.fn(async (org: string, pat: string) => {
    credStoreState.stored.set(org, pat);
  }),
  storeOAuthCredential: vi.fn(async () => {
    /* no-op for tests */
  }),
  deletePat: vi.fn(async (org: string) => {
    if (!credStoreState.stored.has(org)) return false;
    credStoreState.stored.delete(org);
    return true;
  }),
  listOrgsWithStoredPat: vi.fn(async () => credStoreState.listReturns),
  probeBackend: vi.fn(() => 'linux-libsecret'),
}));

vi.mock('../../src/services/auth.js', async (original) => {
  const actual = await (original() as Promise<Record<string, unknown>>);
  return {
    ...actual,
    promptForPat: vi.fn(async () => 'prompted-pat'),
    validatePatAgainstAzdo: vi.fn(async () => ({ ok: true, status: 200 })),
  };
});

vi.mock('../../src/services/org-resolver.js', () => ({
  resolveOrg: vi.fn(({ org }: { org?: string }) => (org ? { org, source: 'flag' } : null)),
  formatResolutionError: vi.fn(() => 'fake resolution error'),
}));

vi.mock('../../src/services/browser-open.js', () => ({
  openUrl: vi.fn(async () => 'opened'),
}));

vi.mock('../../src/services/audit-log.js', () => ({
  appendAuthAuditEvent: vi.fn(),
  readAuditEvents: vi.fn(() => []),
  getAuditLogPath: vi.fn(() => '/private/azdo-test-audit.log'),
}));

import { getPat, storePat, deletePat, listOrgsWithStoredPat } from '../../src/services/credential-store.js';
import { promptForPat, validatePatAgainstAzdo } from '../../src/services/auth.js';
import { openUrl } from '../../src/services/browser-open.js';
import { appendAuthAuditEvent } from '../../src/services/audit-log.js';

const run = createCommandRunner(createAuthCommand);

beforeEach(() => {
  credStoreState.stored.clear();
  credStoreState.listReturns = [];
  vi.mocked(promptForPat).mockReset().mockResolvedValue('prompted-pat');
  vi.mocked(validatePatAgainstAzdo).mockReset().mockResolvedValue({ ok: true, status: 200 });
  vi.mocked(openUrl).mockReset().mockResolvedValue('opened');
  vi.mocked(appendAuthAuditEvent).mockReset();
  vi.mocked(getPat).mockClear();
  vi.mocked(storePat).mockClear();
  vi.mocked(deletePat).mockClear();
  vi.mocked(listOrgsWithStoredPat).mockClear();
  setupProcessSpies();
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe('azdo auth', () => {
  it('stores a validated PAT for the resolved org', async () => {
    await run(['--org', 'myorg']);
    expect(validatePatAgainstAzdo).toHaveBeenCalledWith('prompted-pat', 'myorg');
    expect(storePat).toHaveBeenCalledWith('myorg', 'prompted-pat');
    expect(getStdout()).toContain('PAT stored for org myorg');
    expect(process.exitCode).toBeFalsy();
  });

  it('returns exit code 2 and does not store when validation fails', async () => {
    vi.mocked(validatePatAgainstAzdo).mockResolvedValue({ ok: false, status: 401 });
    await run(['--org', 'myorg']);
    expect(storePat).not.toHaveBeenCalled();
    expect(getStderr()).toContain('PAT validation failed');
    expect(process.exitCode).toBe(2);
  });

  it('returns exit code 3 when org cannot be resolved', async () => {
    await run([]);
    expect(process.exitCode).toBe(3);
    expect(getStderr()).toContain('fake resolution error');
  });

  it('reads PAT from stdin when --from-stdin is passed', async () => {
    const originalStdin = process.stdin;
    const { Readable } = await import('node:stream');
    const fakeStdin = Readable.from(['stdin-pat-value']) as unknown as NodeJS.ReadStream;
    Object.defineProperty(process, 'stdin', { value: fakeStdin, configurable: true });
    try {
      await run(['--org', 'myorg', '--from-stdin']);
    } finally {
      Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
    }
    expect(validatePatAgainstAzdo).toHaveBeenCalledWith('stdin-pat-value', 'myorg');
    expect(storePat).toHaveBeenCalledWith('myorg', 'stdin-pat-value');
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('opens the browser by default and skips it with --no-browser', async () => {
    await run(['--org', 'myorg']);
    expect(openUrl).toHaveBeenCalledWith(expect.stringContaining('dev.azure.com/myorg/_usersSettings/tokens'));

    vi.mocked(openUrl).mockClear();
    await run(['--org', 'myorg', '--no-browser']);
    expect(openUrl).not.toHaveBeenCalled();
  });
});

describe('azdo auth status', () => {
  it('reports stored=true with masked identifier', async () => {
    credStoreState.stored.set('myorg', 'abcdefghijklmnopqrstuvwxyz');
    await run(['status', '--org', 'myorg']);
    expect(getStdout()).toContain('Stored:       yes');
    expect(getStdout()).toContain('Identifier:');
    expect(getStdout()).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('exit 1 with stored=false when no PAT is stored', async () => {
    await run(['status', '--org', 'myorg']);
    expect(process.exitCode).toBe(1);
    expect(getStdout()).toContain('Stored:       no');
  });

  it('emits JSON with --json', async () => {
    credStoreState.stored.set('myorg', 'abcdefghij');
    await run(['status', '--org', 'myorg', '--json']);
    const out = getStdout().trim();
    const parsed = JSON.parse(out);
    expect(parsed.org).toBe('myorg');
    expect(parsed.stored).toBe(true);
    expect(parsed.masked).toBeTruthy();
    expect(out).not.toMatch(/"pat"\s*:/);
  });
});

describe('azdo auth logout', () => {
  it('removes the stored credential for a given org', async () => {
    credStoreState.stored.set('myorg', 'token');
    await run(['logout', '--org', 'myorg']);
    expect(deletePat).toHaveBeenCalledWith('myorg');
    expect(getStdout()).toContain('Credential removed for org myorg');
  });

  it('succeeds with a different message when no credential stored', async () => {
    await run(['logout', '--org', 'myorg']);
    expect(getStdout()).toContain('No stored credential for org myorg');
    expect(process.exitCode).toBeFalsy();
  });

  it('rejects --org together with --all', async () => {
    await run(['logout', '--org', 'myorg', '--all']);
    expect(process.exitCode).toBe(1);
    expect(getStderr()).toContain('mutually exclusive');
  });

  it('removes all stored credentials with --all', async () => {
    credStoreState.stored.set('orgA', 'tA');
    credStoreState.stored.set('orgB', 'tB');
    credStoreState.listReturns = ['orgA', 'orgB'];
    await run(['logout', '--all']);
    expect(deletePat).toHaveBeenCalledWith('orgA');
    expect(deletePat).toHaveBeenCalledWith('orgB');
    expect(getStdout()).toContain('Removed pat credential for org orgA');
    expect(getStdout()).toContain('Removed pat credential for org orgB');
  });

  it('reports when --all finds nothing', async () => {
    credStoreState.listReturns = [];
    await run(['logout', '--all']);
    expect(getStdout()).toContain('No stored credentials to remove');
  });
});
