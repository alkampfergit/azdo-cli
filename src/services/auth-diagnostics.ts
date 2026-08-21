import type { AuthCredential } from '../types/work-item.js';
import type { AuthDiagnosticReport, AuthIdentity, AzdoConnectionData } from '../types/auth-diagnostics.js';
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

// Resolves the identity behind a credential via the connectionData endpoint,
// which works for both PAT and OAuth tokens and needs no scope beyond the one
// already used to connect. Best-effort: any failure yields null rather than
// derailing the diagnosis.
export async function resolveCredentialIdentity(
  org: string,
  cred: AuthCredential,
): Promise<AuthIdentity | null> {
  const url = `https://dev.azure.com/${encodeURIComponent(org)}/_apis/connectionData?api-version=7.1-preview`;
  try {
    const result = await fetchRaw(url, { headers: authHeaders(cred) });
    if (result.status < 200 || result.status >= 300) {
      return null;
    }
    const parsed = JSON.parse(result.body) as AzdoConnectionData;
    const user = parsed.authenticatedUser;
    if (user === undefined) {
      return null;
    }
    return {
      displayName: user.providerDisplayName ?? null,
      uniqueName: user.properties?.Account?.$value ?? null,
      id: user.id ?? null,
    };
  } catch {
    return null;
  }
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
      identity: null,
    };
  }

  const connectivity = await runConnectivityTest(org, cred);

  const envVarName = process.env.AZDO_PAT ? 'AZDO_PAT' : 'dotenv';
  const sourceLabel = cred.source === 'env' ? `env:${envVarName}` : 'credential-store';

  // Skipped when the connection already failed: the lookup would fail too.
  const identity = connectivity.status === 'ok' ? await resolveCredentialIdentity(org, cred) : null;

  return {
    authType: cred.kind ?? 'pat',
    credentialSource: sourceLabel,
    org,
    project,
    connectivityStatus: connectivity.status,
    connectivityError: connectivity.error,
    identity,
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

  // Truthiness rather than `!== null`: a report built before this field
  // existed carries `undefined`, and a missing identity must never crash the
  // formatter.
  const identity = report.identity;
  if (identity) {
    lines.push(`Identity:     ${identity.displayName ?? '(unknown name)'} <${identity.uniqueName ?? '(unknown account)'}>`);
    if (identity.id) {
      lines.push(`Identity id:  ${identity.id}`);
    }
  }

  if (report.connectivityStatus === 'failed' && report.connectivityError !== null) {
    lines.push(`Error:        ${report.connectivityError}`);
  }

  return lines.join('\n');
}
