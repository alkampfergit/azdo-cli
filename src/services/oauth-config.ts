import { loadConfig } from './config-store.js';
import type { OAuthConfig } from '../types/oauth.js';

/**
 * Default project-owned OAuth client id. Shipped publicly with the released
 * binary as a non-secret literal (FR-013a, R11). The placeholder is replaced
 * by the actual GUID once the maintainer registers the shared Entra public
 * OAuth app per `docs/oauth-app-registration.md` (FR-015 / T046–T048).
 *
 * If left as the placeholder, OAuth flows targeting the default app will fail
 * at the IdP — users on locked-down tenants can still use the override path
 * (AZDO_OAUTH_CLIENT_ID / oauth.clientId) without depending on this value.
 */
export const DEFAULT_OAUTH_CLIENT_ID = '__SHIPPED_CLIENT_ID__';

export const DEFAULT_OAUTH_TENANT_ID = 'organizations';

/**
 * Azure DevOps resource id (the well-known AzDO app id) used to scope OAuth
 * tokens for AzDO API calls per R6.
 */
export const AZDO_RESOURCE_ID = '499b84ac-1321-427f-aa17-267ca6975798';

/**
 * FR-016 baseline OAuth scope set. Mirrors the published PAT scope table:
 * - vso.work: Work Items read
 * - vso.work_write: Work Items write
 * - vso.code: Code read (sufficient for PR read per FR-008)
 * - offline_access: required by Entra to issue a refresh token (FR-004)
 * - openid: required by Entra v2.0 when requesting any v2 resource scope
 *
 * NEVER includes vso.full_access by default (FR-016 hard rule).
 */
export function defaultScopes(): readonly string[] {
  return [
    `${AZDO_RESOURCE_ID}/vso.work`,
    `${AZDO_RESOURCE_ID}/vso.work_write`,
    `${AZDO_RESOURCE_ID}/vso.code`,
    'offline_access',
    'openid',
  ];
}

export interface ResolveOAuthConfigOptions {
  clientIdOverride?: string;
  tenantIdOverride?: string;
  scopesOverride?: readonly string[];
  envClientId?: string;
  envTenantId?: string;
}

export interface CliConfigOAuthFields {
  oauth?: {
    clientId?: string;
    tenantId?: string;
  };
}

/**
 * Resolve OAuth configuration with the precedence (highest wins):
 * 1. Explicit flag (clientIdOverride / tenantIdOverride / scopesOverride)
 * 2. Environment variable (AZDO_OAUTH_CLIENT_ID / AZDO_OAUTH_TENANT_ID)
 * 3. Config file (~/.azdo/config.json: oauth.clientId / oauth.tenantId)
 * 4. Default shipped values
 */
export function resolveOAuthConfig(opts: ResolveOAuthConfigOptions = {}): OAuthConfig {
  const envClientId = opts.envClientId ?? process.env.AZDO_OAUTH_CLIENT_ID;
  const envTenantId = opts.envTenantId ?? process.env.AZDO_OAUTH_TENANT_ID;

  const fileConfig = loadConfig() as CliConfigOAuthFields;
  const fileClientId = fileConfig.oauth?.clientId;
  const fileTenantId = fileConfig.oauth?.tenantId;

  let clientId: string;
  let clientIdSource: OAuthConfig['clientIdSource'];
  if (opts.clientIdOverride && opts.clientIdOverride.length > 0) {
    clientId = opts.clientIdOverride;
    clientIdSource = 'flag';
  } else if (envClientId && envClientId.length > 0) {
    clientId = envClientId;
    clientIdSource = 'env';
  } else if (fileClientId && fileClientId.length > 0) {
    clientId = fileClientId;
    clientIdSource = 'config';
  } else {
    clientId = DEFAULT_OAUTH_CLIENT_ID;
    clientIdSource = 'default';
  }

  const tenantId =
    opts.tenantIdOverride ??
    (envTenantId && envTenantId.length > 0 ? envTenantId : null) ??
    (fileTenantId && fileTenantId.length > 0 ? fileTenantId : null) ??
    DEFAULT_OAUTH_TENANT_ID;

  const scopes = opts.scopesOverride && opts.scopesOverride.length > 0 ? [...opts.scopesOverride] : [...defaultScopes()];

  return {
    clientId,
    tenantId,
    scopes,
    clientIdSource,
    authorizationEndpoint: `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize`,
    tokenEndpoint: `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    deviceCodeEndpoint: `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/devicecode`,
  };
}

const REDIRECT_URI_PATTERN = /^http:\/\/127\.0\.0\.1:\d+\/callback$/;

/**
 * RFC 8252 + Entra: only loopback `127.0.0.1` (NOT `localhost`) on a numeric
 * port with the exact path `/callback` is acceptable. Validates the URI sent
 * on /authorize matches this pattern AND the value passed on the token
 * exchange request — exact-match is required for FR-013a.
 */
export function validateRedirectUri(uri: string): boolean {
  return REDIRECT_URI_PATTERN.test(uri);
}

export function buildScopeString(scopes: readonly string[]): string {
  return scopes.join(' ');
}
