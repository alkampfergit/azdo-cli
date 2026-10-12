import { redactText } from '../services/trace-writer.js';

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

function underlyingDetail(cause: unknown): string | null {
  if (!(cause instanceof Error)) return null;
  const text = redactText(cause.message).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const name = cause.name && cause.name !== 'Error' ? `${cause.name}: ` : '';
  return `${name}${text}`;
}

function defaultUnavailableMessage(backend: string, cause?: unknown): string {
  const detail = underlyingDetail(cause);
  const suffix = detail ? `\nUnderlying error: ${detail}` : '';
  if (backend === 'linux-libsecret') {
    // The library reports an unreachable D-Bus socket (sandbox, container, no session bus) the same way as a missing service.
    return (
      'OS secret backend unavailable (linux-libsecret). The Secret Service may be missing or unreachable ' +
      '(for example a sandbox or container blocking the user D-Bus socket, or no session bus).' +
      `${suffix}\n` +
      'Install/start a Secret Service (see docs/linux-credential-store.md), run azdo outside the sandbox, or set AZDO_PAT to bypass the keyring.'
    );
  }
  const base = `OS secret backend unavailable (${backend}). Install the platform's credential service and try again.${suffix}`;
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
    super(message ?? defaultUnavailableMessage(backend, cause));
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
