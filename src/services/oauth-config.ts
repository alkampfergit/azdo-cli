import { loadConfig } from './config-store.js';
import type { OAuthConfig } from '../types/oauth.js';

/**
 * Default OAuth client id. We use Microsoft's well-known "Visual Studio" public
 * client id, which is pre-authorized in the Azure DevOps service principal and
 * therefore can acquire AzDO tokens for both work/school and personal Microsoft
 * accounts without a self-registered application. This is the same client id
 * baked into `Microsoft.VisualStudio.Services.Client` (the official C# SDK)
 * and used by Git Credential Manager, VS Code, and other Microsoft-adjacent
 * tooling. No client secret is required (public client + PKCE).
 *
 * Users on tenants that mandate self-registered OAuth apps can override via
 * AZDO_OAUTH_CLIENT_ID / oauth.clientId / --client-id and supply their own
 * registered client id (FR-013).
 */
export const DEFAULT_OAUTH_CLIENT_ID = '872cd9fa-d31f-45e0-9eab-6e460a02d1f1';

/**
 * Default tenant segment for the Entra v2.0 endpoints. `common` lets any
 * work/school or personal Microsoft account sign in; the issuing tenant is
 * resolved from the user's credentials. Override per-invocation with
 * `--tenant-id` / AZDO_OAUTH_TENANT_ID / oauth.tenantId when targeting a
 * specific (e.g. locked-down) tenant.
 */
export const DEFAULT_OAUTH_TENANT_ID = 'common';

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
    `${AZDO_RESOURCE_ID}/.default`,
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

const REDIRECT_URI_PATTERN = /^http:\/\/(?:127\.0\.0\.1|localhost):\d+(?:\/callback)?$/;

/**
 * RFC 8252 + Entra: only loopback (`127.0.0.1` or `localhost`) on a numeric
 * port is acceptable. The path is optional — `/callback` is used when the
 * registered Entra app whitelists that path; the bare loopback host (no path)
 * is used when targeting Microsoft first-party clients (e.g. the well-known
 * Visual Studio public-client id) whose redirect-URI whitelist is `http://localhost`.
 * Exact-match is enforced on both /authorize and the token-exchange request
 * (FR-013a).
 */
export function validateRedirectUri(uri: string): boolean {
  return REDIRECT_URI_PATTERN.test(uri);
}

export function buildScopeString(scopes: readonly string[]): string {
  return scopes.join(' ');
}
