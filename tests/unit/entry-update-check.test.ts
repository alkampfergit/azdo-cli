import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import type { StoredCredential } from '../../src/types/credential.js';
import {
  getExitCode,
  getStderr,
  getStdout,
  setupProcessSpies,
} from './helpers/command-test-utils.js';

// The point of this suite: drive the REAL `azdo` command tree built by
// createProgram(), so the root postAction hook, commandPathOf() and the
// commander `actionCommand` argument are all exercised together. The
// isolated `skipsUpdateCheck` unit tests hand-build the command path and
// therefore cannot see a regression in that wiring.
const getUpdateNoticeMock = vi.hoisted(() => vi.fn(async () => 'update available: 9.9.9'));
vi.mock('../../src/services/update-check.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/update-check.js')>();
  return { ...actual, getUpdateNotice: getUpdateNoticeMock };
});

const credStoreState = vi.hoisted(() => ({ stored: null as StoredCredential | null }));
vi.mock('../../src/services/credential-store.js', () => ({
  getPat: vi.fn(async () => null),
  getStoredCredential: vi.fn(async () => credStoreState.stored),
  storePat: vi.fn(async () => undefined),
  storeOAuthCredential: vi.fn(async () => undefined),
  deletePat: vi.fn(async () => false),
  listOrgsWithStoredPat: vi.fn(async () => []),
  probeBackend: vi.fn(() => 'linux-libsecret'),
  suppressCredentialStoreNotices: vi.fn(),
}));

vi.mock('../../src/services/org-resolver.js', () => ({
  resolveOrg: vi.fn(({ org }: { org?: string }) => (org ? { org, source: 'flag' } : null)),
  formatResolutionError: vi.fn(() => 'fake resolution error'),
}));

vi.mock('../../src/services/audit-log.js', () => ({
  appendAuthAuditEvent: vi.fn(),
  readAuditEvents: vi.fn(() => []),
  getAuditLogPath: vi.fn(() => '/private/azdo-test-audit.log'),
}));

import { createProgram } from '../../src/program.js';
import { commandPathOf } from '../../src/services/update-check.js';

async function runProgram(args: string[]): Promise<void> {
  const program = createProgram();
  try {
    await program.parseAsync(args, { from: 'user' });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('EXIT_')) return;
    throw err;
  }
}

beforeEach(() => {
  credStoreState.stored = { kind: 'pat', token: 'stored-pat-value' };
  getUpdateNoticeMock.mockClear();
  delete process.env.AZDO_PAT;
  Object.defineProperty(process.stderr, 'isTTY', { value: false, configurable: true });
  setupProcessSpies();
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AZDO_PAT;
});

describe('root postAction update check, over the real command tree', () => {
  it('does not run for `azdo auth token`', async () => {
    await runProgram(['auth', 'token', '--org', 'myorg']);

    expect(getStdout()).toBe('stored-pat-value\n');
    expect(getExitCode()).toBe(0);
    expect(getUpdateNoticeMock).not.toHaveBeenCalled();
    // The notice would land on stderr, which this command promises to leave
    // untouched when it is not a TTY.
    expect(getStderr()).toBe('');
  });

  it('still runs for a sibling command under the same group', async () => {
    await runProgram(['auth', 'status', '--json', '--org', 'myorg']);

    expect(getUpdateNoticeMock).toHaveBeenCalledTimes(1);
    expect(getStderr()).toContain('update available: 9.9.9');
  });
});

describe('commandPathOf', () => {
  it('names the whole chain of the real `auth token` command, root first', () => {
    const program = createProgram();
    const auth = program.commands.find((c) => c.name() === 'auth');
    const token = auth?.commands.find((c) => c.name() === 'token');

    expect(token).toBeDefined();
    expect(commandPathOf(token as Command)).toEqual(['azdo', 'auth', 'token']);
  });

  it('returns just the root for the root command itself', () => {
    expect(commandPathOf(createProgram())).toEqual(['azdo']);
  });
});
