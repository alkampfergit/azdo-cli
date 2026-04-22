export type CredentialBackend =
  | 'windows-credential-manager'
  | 'macos-keychain'
  | 'linux-libsecret'
  | 'unknown';

export interface StoredCredentialMeta {
  org: string;
  backend: CredentialBackend;
}

export class CredentialStoreUnavailableError extends Error {
  readonly backend: string;

  constructor(backend: string, cause?: unknown) {
    super(`OS secret backend unavailable (${backend}). Install the platform's credential service and try again.`);
    this.name = 'CredentialStoreUnavailableError';
    this.backend = backend;
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}
