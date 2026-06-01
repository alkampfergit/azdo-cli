export interface PkceParams {
  verifier: string;
  challenge: string;
  method: 'S256';
}

export interface OAuthConfig {
  clientId: string;
  tenantId: string;
  scopes: readonly string[];
  clientIdSource: 'default' | 'env' | 'config' | 'flag';
  authorizationEndpoint: string;
  tokenEndpoint: string;
  deviceCodeEndpoint: string;
}

export interface AuthorizationSession {
  flow: 'auth-code' | 'device-code';
  org: string;
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  redirectUri: string;
  clientId: string;
  tenantId: string;
  scope: string;
  startedAt: number;
  timeoutAt: number;
  callbackPort?: number;
  deviceCode?: string;
  userCode?: string;
  verificationUri?: string;
  pollIntervalSec?: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

export interface DeviceCodeResponse {
  user_code: string;
  device_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface OAuthErrorResponse {
  error: string;
  error_description?: string;
  error_uri?: string;
}

export interface DecodedIdTokenClaims {
  oid?: string;
  sub?: string;
  preferred_username?: string;
  upn?: string;
  email?: string;
  tid?: string;
  iss?: string;
  aud?: string | string[];
}
