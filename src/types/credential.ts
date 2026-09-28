export type CredentialBackend =
  | 'windows-credential-manager'
  | 'windows-dpapi'
  | 'macos-keychain'
  | 'linux-libsecret'
  | 'unknown';

export interface StoredCredentialMeta {
  org: string;
  backend: CredentialBackend;
}

export interface StoredPatCredential {
  kind: 'pat';
  token: string;
}

export interface StoredOAuthCredential {
  kind: 'oauth';
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  issuedAt: number;
  accountId: string;
  scope: string;
  tenantId: string;
}

export type StoredCredential = StoredPatCredential | StoredOAuthCredential;

export type UsableCredential =
  | { kind: 'pat'; token: string }
  | { kind: 'oauth'; bearerToken: string; accountId: string };

function defaultUnavailableMessage(backend: string): string {
  const base = `OS secret backend unavailable (${backend}). Install the platform's credential service and try again.`;
  if (backend !== 'windows-credential-manager') return base;
  // The usual cause on Windows is an OpenSSH session, which has no credential vault.
  return (
    `${base}\n` +
    'Over SSH, Windows Credential Manager is not reachable. Store credentials with DPAPI in ~/.azdo instead: ' +
    '`azdo config set credentialStore dpapi` (or AZDO_CREDENTIAL_STORE=dpapi), then `azdo auth login` again.'
  );
}

export class CredentialStoreUnavailableError extends Error {
  readonly backend: string;

  constructor(backend: string, cause?: unknown, message?: string) {
    super(message ?? defaultUnavailableMessage(backend));
    this.name = 'CredentialStoreUnavailableError';
    this.backend = backend;
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

export class CredentialMissingError extends Error {
  readonly org: string;

  constructor(org: string) {
    super(`No stored credential for org "${org}". Run \`azdo auth login --org ${org}\` to authenticate.`);
    this.name = 'CredentialMissingError';
    this.org = org;
  }
}

export type CredentialRefreshReason =
  | 'revoked'
  | 'window-exceeded'
  | 'invalid-grant'
  | 'network'
  | 'unknown';

export class CredentialRefreshError extends Error {
  readonly org: string;
  readonly reason: CredentialRefreshReason;
  readonly userMessage: string;

  constructor(org: string, reason: CredentialRefreshReason, cause?: unknown) {
    const userMessage =
      reason === 'network'
        ? `OAuth refresh for org \`${org}\` failed (network error); check connectivity and retry the command. The stored credential is preserved.`
        : `Refresh token rejected for org \`${org}\`; run \`azdo auth login --org ${org}\` to re-authorise. The stored credential is preserved (FR-014) — inspect it with \`azdo auth status --org ${org}\`.`;
    super(userMessage);
    this.name = 'CredentialRefreshError';
    this.org = org;
    this.reason = reason;
    this.userMessage = userMessage;
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}
