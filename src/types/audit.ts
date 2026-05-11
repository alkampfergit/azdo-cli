import type { CredentialBackend } from './credential.js';

export type AuthAuditEventKind =
  | 'auth.store'
  | 'auth.delete'
  | 'auth.validate.ok'
  | 'auth.validate.fail'
  | 'oauth-login-started'
  | 'oauth-login-success'
  | 'oauth-login-failed'
  | 'oauth-refresh-success'
  | 'oauth-refresh-failed'
  | 'oauth-logout'
  | 'unknown-kind';

export type OAuthFlow = 'auth-code' | 'device-code';

export type OAuthClientIdSource = 'default' | 'env' | 'config' | 'flag';

export type OAuthLoginFailedReason =
  | 'user-cancelled'
  | 'port-conflict'
  | 'state-mismatch'
  | 'redirect-mismatch'
  | 'idp-error'
  | 'timeout'
  | 'expired_token'
  | 'access_denied'
  | 'unknown';

export type OAuthRefreshFailedReason =
  | 'revoked'
  | 'window-exceeded'
  | 'invalid-grant'
  | 'network'
  | 'unknown';

export interface AuthAuditEvent {
  ts: string;
  event: AuthAuditEventKind;
  org: string;
  backend: CredentialBackend;
  masked_pat?: string;
  flow?: OAuthFlow;
  clientIdSource?: OAuthClientIdSource;
  accountId?: string;
  scope?: string;
  tokenLifetimeSec?: number;
  reason?: OAuthLoginFailedReason | OAuthRefreshFailedReason;
}
