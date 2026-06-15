export interface AuthDiagnosticReport {
  authType: 'pat' | 'oauth' | 'none';
  credentialSource: string | null;
  org: string;
  project: string | null;
  connectivityStatus: 'ok' | 'failed' | 'no-credentials';
  connectivityError: string | null;
}

export interface TraceEntry {
  timestamp: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: string;
}
