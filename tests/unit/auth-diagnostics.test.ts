import { describe, expect, it, vi } from 'vitest';
import {
  diagnoseAuth,
  formatDiagnosticReport,
  resolveCredentialIdentity,
  runConnectivityTest,
} from '../../src/services/auth-diagnostics.js';
import type { AuthDiagnosticReport } from '../../src/types/auth-diagnostics.js';
import type { AuthCredential } from '../../src/types/work-item.js';

const { fetchRawMock } = vi.hoisted(() => ({ fetchRawMock: vi.fn() }));

vi.mock('../../src/services/azdo-client.js', () => ({
  authHeaders: vi.fn(() => ({ Authorization: 'Basic test' })),
  fetchRaw: fetchRawMock,
}));

const mockPatCred: AuthCredential = { pat: 'tok', source: 'env', kind: 'pat' };
const mockOAuthCred: AuthCredential = { pat: 'tok', source: 'credential-store', kind: 'oauth' };

describe('runConnectivityTest', () => {
  it('returns ok on 2xx', async () => {
    fetchRawMock.mockResolvedValue({ status: 200, body: '{"value":[]}' });
    const result = await runConnectivityTest('myorg', mockPatCred);
    expect(result.status).toBe('ok');
    expect(result.error).toBeNull();
  });

  it('returns failed with HTTP status on non-2xx without message', async () => {
    fetchRawMock.mockResolvedValue({ status: 401, body: '{}' });
    const result = await runConnectivityTest('myorg', mockPatCred);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('HTTP 401');
  });

  it('extracts message from JSON body on error', async () => {
    fetchRawMock.mockResolvedValue({ status: 403, body: JSON.stringify({ message: 'Access denied' }) });
    const result = await runConnectivityTest('myorg', mockPatCred);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Access denied');
  });

  it('returns failed when fetchRaw throws', async () => {
    fetchRawMock.mockRejectedValue(new Error('NETWORK_ERROR'));
    const result = await runConnectivityTest('myorg', mockPatCred);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('NETWORK_ERROR');
  });
});

describe('diagnoseAuth', () => {
  it('returns no-credentials when resolver returns null', async () => {
    const report = await diagnoseAuth('myorg', null, async () => null);
    expect(report.authType).toBe('none');
    expect(report.connectivityStatus).toBe('no-credentials');
    expect(report.credentialSource).toBeNull();
  });

  it('returns pat auth type with env source', async () => {
    fetchRawMock.mockResolvedValue({ status: 200, body: '{"value":[]}' });
    process.env.AZDO_PAT = 'tok';
    const report = await diagnoseAuth('myorg', 'proj', async () => mockPatCred);
    expect(report.authType).toBe('pat');
    expect(report.credentialSource).toContain('env');
    expect(report.connectivityStatus).toBe('ok');
    expect(report.org).toBe('myorg');
    expect(report.project).toBe('proj');
    delete process.env.AZDO_PAT;
  });

  it('returns oauth auth type with credential-store source', async () => {
    fetchRawMock.mockResolvedValue({ status: 200, body: '{}' });
    const report = await diagnoseAuth('myorg', null, async () => mockOAuthCred);
    expect(report.authType).toBe('oauth');
    expect(report.credentialSource).toBe('credential-store');
  });
});

const CONNECTION_DATA = JSON.stringify({
  authenticatedUser: {
    id: '11111111-2222-3333-4444-555555555555',
    providerDisplayName: 'William Verdolini',
    properties: { Account: { $value: 'william.verdolini@example.test' } },
  },
});

// Answering "is this token the pull request author?" needs a comparable
// identity; a display name is neither unique nor stable.
describe('resolveCredentialIdentity', () => {
  it('maps the connectionData payload', async () => {
    fetchRawMock.mockResolvedValue({ status: 200, body: CONNECTION_DATA });

    const identity = await resolveCredentialIdentity('myorg', mockPatCred);

    expect(identity).toEqual({
      displayName: 'William Verdolini',
      uniqueName: 'william.verdolini@example.test',
      id: '11111111-2222-3333-4444-555555555555',
    });
    expect(fetchRawMock).toHaveBeenCalledWith(
      expect.stringContaining('/_apis/connectionData'),
      expect.any(Object),
    );
  });

  it('returns nulls per field when the payload is partial', async () => {
    fetchRawMock.mockResolvedValue({ status: 200, body: '{"authenticatedUser":{"id":"abc"}}' });

    await expect(resolveCredentialIdentity('myorg', mockPatCred)).resolves.toEqual({
      displayName: null,
      uniqueName: null,
      id: 'abc',
    });
  });

  it.each([
    ['a non-2xx response', { status: 403, body: '' }],
    ['a body without authenticatedUser', { status: 200, body: '{}' }],
    ['an unparseable body', { status: 200, body: 'not json' }],
  ])('returns null on %s rather than failing the diagnosis', async (_case, response) => {
    fetchRawMock.mockResolvedValue(response);
    await expect(resolveCredentialIdentity('myorg', mockPatCred)).resolves.toBeNull();
  });

  it('returns null when the request throws', async () => {
    fetchRawMock.mockRejectedValue(new Error('boom'));
    await expect(resolveCredentialIdentity('myorg', mockPatCred)).resolves.toBeNull();
  });
});

describe('diagnoseAuth identity', () => {
  it('includes the identity when connectivity succeeded', async () => {
    fetchRawMock.mockReset();
    fetchRawMock
      .mockResolvedValueOnce({ status: 200, body: '{"value":[]}' })
      .mockResolvedValueOnce({ status: 200, body: CONNECTION_DATA });

    const report = await diagnoseAuth('myorg', 'proj', async () => mockPatCred);

    expect(report.identity?.uniqueName).toBe('william.verdolini@example.test');
  });

  it('skips the identity lookup when connectivity already failed', async () => {
    fetchRawMock.mockReset();
    fetchRawMock.mockResolvedValue({ status: 401, body: '' });

    const report = await diagnoseAuth('myorg', 'proj', async () => mockPatCred);

    expect(report.connectivityStatus).toBe('failed');
    expect(report.identity).toBeNull();
    // One call only: no point asking who we are on a connection that failed.
    expect(fetchRawMock).toHaveBeenCalledTimes(1);
  });

  it('reports a null identity when there is no credential at all', async () => {
    const report = await diagnoseAuth('myorg', null, async () => null);
    expect(report.identity).toBeNull();
  });
});

describe('formatDiagnosticReport', () => {
  const okReport: AuthDiagnosticReport = {
    authType: 'pat',
    credentialSource: 'env:AZDO_PAT',
    org: 'myorg',
    project: 'myproj',
    connectivityStatus: 'ok',
    connectivityError: null,
    identity: null,
  };

  it('formats human-readable report', () => {
    const text = formatDiagnosticReport(okReport, false);
    expect(text).toContain('Auth type:');
    expect(text).toContain('pat');
    expect(text).toContain('myorg');
    expect(text).toContain('myproj');
    expect(text).toContain('OK');
    expect(text).not.toContain('Error:');
  });

  it('formats JSON report', () => {
    const text = formatDiagnosticReport(okReport, true);
    const parsed = JSON.parse(text) as AuthDiagnosticReport;
    expect(parsed.authType).toBe('pat');
    expect(parsed.org).toBe('myorg');
  });

  it('includes Error line on failed connectivity', () => {
    const failReport: AuthDiagnosticReport = {
      ...okReport,
      connectivityStatus: 'failed',
      connectivityError: 'Access denied',
    };
    const text = formatDiagnosticReport(failReport, false);
    expect(text).toContain('FAILED');
    expect(text).toContain('Error:');
    expect(text).toContain('Access denied');
  });

  it('shows (none) for null source', () => {
    const noCredReport: AuthDiagnosticReport = {
      ...okReport,
      authType: 'none',
      credentialSource: null,
      connectivityStatus: 'no-credentials',
    };
    const text = formatDiagnosticReport(noCredReport, false);
    expect(text).toContain('(none)');
    expect(text).toContain('no credentials found');
  });

  it('prints the credential identity when it was resolved', () => {
    const withIdentity: AuthDiagnosticReport = {
      ...okReport,
      identity: {
        displayName: 'William Verdolini',
        uniqueName: 'william.verdolini@example.test',
        id: '11111111-2222-3333-4444-555555555555',
      },
    };
    const text = formatDiagnosticReport(withIdentity, false);
    expect(text).toContain('Identity:     William Verdolini <william.verdolini@example.test>');
    expect(text).toContain('Identity id:  11111111-2222-3333-4444-555555555555');
  });

  it('omits the identity lines when it could not be resolved', () => {
    const text = formatDiagnosticReport(okReport, false);
    expect(text).not.toContain('Identity:');
  });

  it('shows (not set) for null project', () => {
    const noProjectReport: AuthDiagnosticReport = { ...okReport, project: null };
    const text = formatDiagnosticReport(noProjectReport, false);
    expect(text).toContain('(not set)');
  });
});
