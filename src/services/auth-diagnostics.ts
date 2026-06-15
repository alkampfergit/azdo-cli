import type { AuthCredential } from '../types/work-item.js';
import type { AuthDiagnosticReport } from '../types/auth-diagnostics.js';
import { authHeaders, fetchRaw } from './azdo-client.js';

interface ConnectivityResult {
  status: 'ok' | 'failed';
  error: string | null;
}

export async function runConnectivityTest(org: string, cred: AuthCredential): Promise<ConnectivityResult> {
  const url = `https://dev.azure.com/${encodeURIComponent(org)}/_apis/projects?api-version=7.1&$top=1`;
  let result: { status: number; body: string };
  try {
    result = await fetchRaw(url, { headers: authHeaders(cred) });
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
  if (result.status >= 200 && result.status < 300) {
    return { status: 'ok', error: null };
  }
  let error = `HTTP ${result.status}`;
  try {
    const parsed = JSON.parse(result.body) as { message?: unknown };
    if (typeof parsed.message === 'string' && parsed.message.trim() !== '') {
      error = parsed.message.trim();
    }
  } catch { /* use fallback */ }
  return { status: 'failed', error };
}

export async function diagnoseAuth(
  org: string,
  project: string | null,
  resolveCredential: (o: string) => Promise<AuthCredential | null>,
): Promise<AuthDiagnosticReport> {
  const cred = await resolveCredential(org);

  if (cred === null) {
    return {
      authType: 'none',
      credentialSource: null,
      org,
      project,
      connectivityStatus: 'no-credentials',
      connectivityError: null,
    };
  }

  const connectivity = await runConnectivityTest(org, cred);

  const envVarName = process.env.AZDO_PAT ? 'AZDO_PAT' : 'dotenv';
  const sourceLabel = cred.source === 'env' ? `env:${envVarName}` : 'credential-store';

  return {
    authType: cred.kind ?? 'pat',
    credentialSource: sourceLabel,
    org,
    project,
    connectivityStatus: connectivity.status,
    connectivityError: connectivity.error,
  };
}

export function formatDiagnosticReport(report: AuthDiagnosticReport, json: boolean): string {
  if (json) {
    return JSON.stringify(report, null, 2);
  }

  let connectivityLine: string;
  if (report.connectivityStatus === 'ok') {
    connectivityLine = 'OK';
  } else if (report.connectivityStatus === 'no-credentials') {
    connectivityLine = 'no credentials found';
  } else {
    connectivityLine = 'FAILED';
  }

  const lines = [
    `Auth type:    ${report.authType}`,
    `Source:       ${report.credentialSource ?? '(none)'}`,
    `Org:          ${report.org}`,
    `Project:      ${report.project ?? '(not set)'}`,
    `Connectivity: ${connectivityLine}`,
  ];

  if (report.connectivityStatus === 'failed' && report.connectivityError !== null) {
    lines.push(`Error:        ${report.connectivityError}`);
  }

  return lines.join('\n');
}
