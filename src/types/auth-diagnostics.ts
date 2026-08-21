// Who the credential belongs to, as Azure DevOps reports it. Needed to answer
// "is this token the pull request author?" — a check `pr comments add` callers
// perform before posting, and one that cannot be done against a display name
// or against `git config user.name` (which says nothing about the token).
export interface AuthIdentity {
  displayName: string | null;
  /** Account name, usually an email — the comparable value. */
  uniqueName: string | null;
  /** Azure DevOps identity GUID. */
  id: string | null;
}

export interface AuthDiagnosticReport {
  authType: 'pat' | 'oauth' | 'none';
  credentialSource: string | null;
  org: string;
  project: string | null;
  connectivityStatus: 'ok' | 'failed' | 'no-credentials';
  connectivityError: string | null;
  /**
   * Identity behind the credential; null when there is no credential, when
   * connectivity already failed, or when the identity lookup itself failed —
   * diagnosing auth must never break because of this extra call.
   */
  identity: AuthIdentity | null;
}

/** Minimal shape of GET /_apis/connectionData. */
export interface AzdoConnectionData {
  authenticatedUser?: {
    id?: string;
    providerDisplayName?: string;
    properties?: {
      Account?: { $value?: string };
    };
  };
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
