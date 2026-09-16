import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthCommand } from '../../src/commands/auth.js';
import {
  CredentialRefreshError,
  CredentialStoreUnavailableError,
  type StoredCredential,
  type StoredOAuthCredential,
} from '../../src/types/credential.js';
import {
  createCommandRunner,
  getExitCode,
  getStderr,
  getStdout,
  setupProcessSpies,
} from './helpers/command-test-utils.js';

const credStoreState = vi.hoisted(() => ({
  stored: null as StoredCredential | null,
  throwUnavailable: false,
}));

vi.mock('../../src/services/credential-store.js', () => ({
  getPat: vi.fn(async () => null),
  getStoredCredential: vi.fn(async () => {
    if (credStoreState.throwUnavailable) {
      throw new CredentialStoreUnavailableError('linux-libsecret');
    }
    return credStoreState.stored;
  }),
  storePat: vi.fn(async () => undefined),
  storeOAuthCredential: vi.fn(async () => undefined),
  deletePat: vi.fn(async () => false),
  listOrgsWithStoredPat: vi.fn(async () => []),
  probeBackend: vi.fn(() => 'linux-libsecret'),
}));

const refreshIfNeededMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/oauth-token-refresh.js', () => ({
  refreshIfNeeded: refreshIfNeededMock,
}));

const resolveOrgMock = vi.hoisted(() =>
  vi.fn(({ org }: { org?: string }) => (org ? { org, source: 'flag' } : null)),
);
vi.mock('../../src/services/org-resolver.js', () => ({
  resolveOrg: resolveOrgMock,
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

import { appendAuthAuditEvent } from '../../src/services/audit-log.js';

const run = createCommandRunner(createAuthCommand);

const OAUTH_CRED: StoredOAuthCredential = {
  kind: 'oauth',
  accessToken: 'stale-access-token',
  refreshToken: 'refresh-token',
  expiresAt: 1_800_000_000,
  issuedAt: 1_799_996_400,
  accountId: 'user@contoso.com',
  scope: 'vso.code',
  tenantId: 'common',
};

/** stderr is not a TTY by default in vitest; flip it for the description tests. */
function setStderrTty(isTty: boolean): void {
  Object.defineProperty(process.stderr, 'isTTY', { value: isTty, configurable: true });
}

beforeEach(() => {
  credStoreState.stored = null;
  credStoreState.throwUnavailable = false;
  refreshIfNeededMock.mockReset().mockImplementation(async (_org: string, cred: StoredOAuthCredential) => cred);
  vi.mocked(appendAuthAuditEvent).mockReset();
  resolveOrgMock.mockClear();
  delete process.env.AZDO_PAT;
  setStderrTty(false);
  setupProcessSpies();
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AZDO_PAT;
});

describe('azdo auth token', () => {
  it('prints exactly the stored PAT and a newline on stdout', async () => {
    credStoreState.stored = { kind: 'pat', token: 'stored-pat-value' };

    await run(['token', '--org', 'myorg']);

    expect(getStdout()).toBe('stored-pat-value\n');
    expect(getExitCode()).toBe(0);
  });

  it('writes nothing to stderr when stderr is not a TTY', async () => {
    credStoreState.stored = { kind: 'pat', token: 'stored-pat-value' };

    await run(['token', '--org', 'myorg']);

    expect(getStderr()).toBe('');
  });

  it('describes the credential on stderr when stderr is a TTY', async () => {
    credStoreState.stored = { kind: 'pat', token: 'stored-pat-value' };
    setStderrTty(true);

    await run(['token', '--org', 'myorg']);

    const stderr = getStderr();
    expect(stderr).toContain('PAT for org myorg from the OS credential store (linux-libsecret).');
    expect(stderr).toContain('Authorization: Basic');
    // The description must never carry the token itself.
    expect(stderr).not.toContain('stored-pat-value');
    expect(getStdout()).toBe('stored-pat-value\n');
  });

  it('describes an OAuth credential with account, expiry and the Bearer form', async () => {
    credStoreState.stored = OAUTH_CRED;
    setStderrTty(true);

    await run(['token', '--org', 'myorg']);

    const stderr = getStderr();
    expect(stderr).toContain('OAuth access token for org myorg');
    expect(stderr).toContain('account user@contoso.com');
    expect(stderr).toContain(new Date(OAUTH_CRED.expiresAt * 1000).toISOString());
    expect(stderr).toContain('Authorization: Bearer');
  });

  it('refreshes an expired OAuth access token and prints the fresh one', async () => {
    credStoreState.stored = OAUTH_CRED;
    refreshIfNeededMock.mockResolvedValue({
      ...OAUTH_CRED,
      accessToken: 'fresh-access-token',
      expiresAt: 1_800_003_600,
    });

    await run(['token', '--org', 'myorg']);

    expect(refreshIfNeededMock).toHaveBeenCalledWith('myorg', OAUTH_CRED);
    expect(getStdout()).toBe('fresh-access-token\n');
    expect(getExitCode()).toBe(0);
  });

  it('prefers AZDO_PAT over the stored credential', async () => {
    process.env.AZDO_PAT = 'env-pat-value';
    credStoreState.stored = { kind: 'pat', token: 'stored-pat-value' };
    setStderrTty(true);

    await run(['token', '--org', 'myorg']);

    expect(getStdout()).toBe('env-pat-value\n');
    expect(getStderr()).toContain('from the AZDO_PAT environment variable');
  });

  it('records an auth.token audit event carrying no token material', async () => {
    credStoreState.stored = { kind: 'pat', token: 'stored-pat-value' };

    await run(['token', '--org', 'myorg']);

    expect(appendAuthAuditEvent).toHaveBeenCalledTimes(1);
    const record = vi.mocked(appendAuthAuditEvent).mock.calls[0][0];
    expect(record).toEqual({ event: 'auth.token', org: 'myorg', backend: 'linux-libsecret' });
    expect(JSON.stringify(record)).not.toContain('stored-pat-value');
  });

  it('records the account id for an OAuth export', async () => {
    credStoreState.stored = OAUTH_CRED;

    await run(['token', '--org', 'myorg']);

    const record = vi.mocked(appendAuthAuditEvent).mock.calls[0][0];
    expect(record).toEqual({
      event: 'auth.token',
      org: 'myorg',
      backend: 'linux-libsecret',
      accountId: 'user@contoso.com',
    });
    expect(JSON.stringify(record)).not.toContain('stale-access-token');
  });

  it('fails with exit 1 and an empty stdout when nothing is stored', async () => {
    credStoreState.stored = null;

    await run(['token', '--org', 'myorg']);

    expect(getStdout()).toBe('');
    expect(getStderr()).toContain('No stored credential for org "myorg"');
    expect(getStderr()).toContain('azdo auth login --org myorg');
    expect(getExitCode()).toBe(1);
    expect(appendAuthAuditEvent).not.toHaveBeenCalled();
  });

  it('fails with exit 1 when the OAuth refresh is rejected, without printing a token', async () => {
    credStoreState.stored = OAUTH_CRED;
    refreshIfNeededMock.mockRejectedValue(new CredentialRefreshError('myorg', 'invalid-grant'));

    await run(['token', '--org', 'myorg']);

    expect(getStdout()).toBe('');
    expect(getStderr()).toContain('Refresh token rejected for org `myorg`');
    expect(getExitCode()).toBe(1);
  });

  it('fails with exit 3 when the org cannot be resolved', async () => {
    await run(['token']);

    expect(getStdout()).toBe('');
    expect(getStderr()).toContain('fake resolution error');
    expect(getExitCode()).toBe(3);
  });

  it('fails with exit 4 when the credential store is unavailable', async () => {
    credStoreState.throwUnavailable = true;

    await run(['token', '--org', 'myorg']);

    expect(getStdout()).toBe('');
    expect(getStderr()).toContain('OS secret backend unavailable');
    expect(getExitCode()).toBe(4);
  });

  it('has no --json option, so the token can never land in a JSON payload', async () => {
    credStoreState.stored = { kind: 'pat', token: 'stored-pat-value' };

    await run(['token', '--org', 'myorg', '--json']);

    expect(getStdout()).toBe('');
    expect(getStderr()).toContain("unknown option '--json'");
  });
});
