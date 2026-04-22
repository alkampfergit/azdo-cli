import type { CredentialBackend } from './credential.js';

export type AuthAuditEventKind =
  | 'auth.store'
  | 'auth.delete'
  | 'auth.validate.ok'
  | 'auth.validate.fail';

export interface AuthAuditEvent {
  ts: string;
  event: AuthAuditEventKind;
  org: string;
  backend: CredentialBackend;
  masked_pat?: string;
}
