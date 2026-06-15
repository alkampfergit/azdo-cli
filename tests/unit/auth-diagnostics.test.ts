import { describe, expect, it, vi } from 'vitest';
import { diagnoseAuth, formatDiagnosticReport, runConnectivityTest } from '../../src/services/auth-diagnostics.js';
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

describe('formatDiagnosticReport', () => {
  const okReport: AuthDiagnosticReport = {
    authType: 'pat',
    credentialSource: 'env:AZDO_PAT',
    org: 'myorg',
    project: 'myproj',
    connectivityStatus: 'ok',
    connectivityError: null,
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

  it('shows (not set) for null project', () => {
    const noProjectReport: AuthDiagnosticReport = { ...okReport, project: null };
    const text = formatDiagnosticReport(noProjectReport, false);
    expect(text).toContain('(not set)');
  });
});
