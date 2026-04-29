import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { challengeForVerifier, generateVerifier, randomState, CODE_CHALLENGE_METHOD } from '../lib/pkce.js';
import { buildScopeString, validateRedirectUri } from './oauth-config.js';
import { openUrl } from './browser-open.js';
import type { AuthorizationSession, DecodedIdTokenClaims, OAuthConfig, TokenResponse } from '../types/oauth.js';
import type { StoredOAuthCredential } from '../types/credential.js';

export class OAuthFlowError extends Error {
  readonly reason:
    | 'user-cancelled'
    | 'port-conflict'
    | 'state-mismatch'
    | 'redirect-mismatch'
    | 'idp-error'
    | 'timeout';

  /**
   * Structured IdP error code preserved verbatim from the OAuth error
   * response (e.g. "invalid_grant", "AADSTS70008", "consent_required").
   * Populated for `idp-error` reason when the IdP returned a parseable JSON
   * error body. Undefined for other reasons (state-mismatch, port-conflict,
   * timeout, etc.) where there is no IdP error code to forward.
   *
   * Callers that translate OAuth errors into a finer classification
   * (e.g. oauth-token-refresh.classifyRefreshFailure) MUST inspect this
   * field — the formatted .message string is intended for human display
   * and is NOT a stable parsing surface.
   */
  readonly idpErrorCode?: string;
  readonly idpErrorDescription?: string;

  constructor(
    reason: OAuthFlowError['reason'],
    message: string,
    cause?: unknown,
    idp?: { error?: string; error_description?: string },
  ) {
    super(message);
    this.name = 'OAuthFlowError';
    this.reason = reason;
    if (cause instanceof Error) {
      this.cause = cause;
    }
    if (idp?.error) this.idpErrorCode = idp.error;
    if (idp?.error_description) this.idpErrorDescription = idp.error_description;
  }
}

export interface AuthCodeFlowDeps {
  /** Inject a custom server factory for tests; default = node:http createServer. */
  createServer?: typeof createServer;
  /** Inject browser-open hook for tests; default = services/browser-open.openUrl. */
  openUrl?: typeof openUrl;
  /** Inject fetch for tests; default = global fetch. */
  fetch?: typeof fetch;
  /** Override the auth-code timeout. Default 5 minutes. */
  timeoutMs?: number;
  /** Override "now" for tests. */
  now?: () => number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const SHARED_HTML_STYLE =
  '<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:8em auto;text-align:center;color:#222}p{color:#555}</style>';

function successHtml(org: string): string {
  const escapedOrg = escapeHtml(org);
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>Login complete</title>' +
    SHARED_HTML_STYLE +
    '</head><body><h1 style="color:#107c10">Login complete</h1>' +
    '<p>You can close this tab and return to the terminal.</p>' +
    '<p style="font-size:0.9em">Organization: <code>' +
    escapedOrg +
    '</code></p></body></html>'
  );
}

function errorHtml(msg: string): string {
  const escapedMsg = escapeHtml(msg);
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>Login failed</title>' +
    SHARED_HTML_STYLE +
    '</head><body><h1 style="color:#c50f1f">Login failed</h1>' +
    '<p>' +
    escapedMsg +
    '</p>' +
    '<p style="font-size:0.9em">Return to the terminal for details.</p></body></html>'
  );
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export interface CallbackResult {
  code: string;
}

export interface LoopbackListener {
  port: number;
  awaitCallback: (session: AuthorizationSession, signal: AbortSignal) => Promise<CallbackResult>;
  close: () => Promise<void>;
}

interface ActiveSlot {
  session: AuthorizationSession;
  resolve: (r: CallbackResult) => void;
  reject: (e: Error) => void;
}

class LoopbackListenerImpl implements LoopbackListener {
  active: ActiveSlot | null = null;

  constructor(readonly server: Server, readonly port: number) {}

  awaitCallback(session: AuthorizationSession, signal: AbortSignal): Promise<CallbackResult> {
    return new Promise<CallbackResult>((rResolve, rReject) => {
      this.active = {
        session,
        resolve: (r) => this.finish(rResolve, r),
        reject: (e) => this.finishError(rReject, e),
      };
      signal.addEventListener('abort', () => this.onAbort());
    });
  }

  close(): Promise<void> {
    return new Promise<void>((cResolve) => {
      this.server.close(() => cResolve());
    });
  }

  private finish(rResolve: (r: CallbackResult) => void, r: CallbackResult): void {
    this.active = null;
    rResolve(r);
  }

  private finishError(rReject: (e: Error) => void, e: Error): void {
    this.active = null;
    rReject(e);
  }

  private onAbort(): void {
    if (!this.active) return;
    const a = this.active;
    this.active = null;
    a.reject(new OAuthFlowError('timeout', 'OAuth flow aborted before callback'));
  }
}

function bindLoopbackServer(
  factory: typeof createServer,
  resolve: (l: LoopbackListener) => void,
  reject: (e: Error) => void,
): void {
  const ref: { listener: LoopbackListenerImpl | null } = { listener: null };
  const server: Server = factory((req: IncomingMessage, res: ServerResponse) => {
    handleCallback(req, res, ref.listener?.active ?? null);
  });
  server.once('error', (err: Error) => {
    reject(new OAuthFlowError('port-conflict', `failed to bind loopback listener: ${err.message}`, err));
  });
  server.listen({ host: '127.0.0.1', port: 0 }, () => {
    const addr = server.address();
    if (!addr || typeof addr === 'string' || addr.port === 0) {
      reject(new OAuthFlowError('port-conflict', 'loopback listener did not return a numeric port'));
      return;
    }
    ref.listener = new LoopbackListenerImpl(server, addr.port);
    resolve(ref.listener);
  });
}

export async function openLoopbackListener(deps: AuthCodeFlowDeps = {}): Promise<LoopbackListener> {
  const factory = deps.createServer ?? createServer;
  return new Promise<LoopbackListener>((resolve, reject) => {
    bindLoopbackServer(factory, resolve, reject);
  });
}

function handleCallback(req: IncomingMessage, res: ServerResponse, active: ActiveSlot | null): void {
  if (!req.url) {
    writeError(res, 400, 'missing request URL');
    return;
  }
  const url = new URL(req.url, 'http://127.0.0.1');
  const path = url.pathname;
  const q = url.searchParams;

  if (path !== '/callback' && path !== '/') {
    writeError(res, 404, `unexpected path ${path}`);
    if (active) active.reject(new OAuthFlowError('redirect-mismatch', `unexpected callback path "${path}"`));
    return;
  }

  if (!active) {
    writeError(res, 503, 'no active OAuth flow');
    return;
  }

  const error = q.get('error');
  if (error) {
    const rawDesc = q.get('error_description') ?? '';
    const descSuffix = rawDesc ? `: ${rawDesc}` : '';
    writeError(res, 400, `IdP error: ${error}`);
    active.reject(new OAuthFlowError('idp-error', `${error}${descSuffix}`));
    return;
  }

  const state = q.get('state');
  if (!state || state !== active.session.state) {
    writeError(res, 400, 'state mismatch');
    active.reject(new OAuthFlowError('state-mismatch', 'OAuth state parameter did not match originating session'));
    return;
  }

  const code = q.get('code');
  if (!code) {
    writeError(res, 400, 'missing authorization code');
    active.reject(new OAuthFlowError('idp-error', 'callback missing authorization code'));
    return;
  }

  writeSuccess(res, active.session.org);
  active.resolve({ code });
}

function writeSuccess(res: ServerResponse, org: string): void {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(successHtml(org));
}

function writeError(res: ServerResponse, status: number, msg: string): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(errorHtml(msg));
}

export interface PrepareSessionInput {
  org: string;
  oauthConfig: OAuthConfig;
  redirectUri: string;
  now: number;
  timeoutMs: number;
}

export function prepareAuthCodeSession(input: PrepareSessionInput): AuthorizationSession {
  if (!validateRedirectUri(input.redirectUri)) {
    throw new OAuthFlowError(
      'redirect-mismatch',
      `redirect URI must be loopback-only (http://127.0.0.1:<port>/callback): ${input.redirectUri}`,
    );
  }
  const verifier = generateVerifier();
  const challenge = challengeForVerifier(verifier);
  const state = randomState();
  return {
    flow: 'auth-code',
    org: input.org,
    state,
    codeVerifier: verifier,
    codeChallenge: challenge,
    redirectUri: input.redirectUri,
    clientId: input.oauthConfig.clientId,
    tenantId: input.oauthConfig.tenantId,
    scope: buildScopeString(input.oauthConfig.scopes),
    startedAt: Math.floor(input.now / 1000),
    timeoutAt: Math.floor((input.now + input.timeoutMs) / 1000),
  };
}

export function buildAuthorizationUrl(session: AuthorizationSession, oauthConfig: OAuthConfig): string {
  const params = new URLSearchParams({
    client_id: session.clientId,
    response_type: 'code',
    redirect_uri: session.redirectUri,
    scope: session.scope,
    state: session.state,
    code_challenge: session.codeChallenge,
    code_challenge_method: CODE_CHALLENGE_METHOD,
    prompt: 'select_account',
  });
  return `${oauthConfig.authorizationEndpoint}?${params.toString()}`;
}

export async function exchangeCodeForToken(
  code: string,
  session: AuthorizationSession,
  oauthConfig: OAuthConfig,
  fetchFn: typeof fetch,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: session.redirectUri,
    client_id: session.clientId,
    code_verifier: session.codeVerifier,
    scope: session.scope,
  });
  const response = await fetchFn(oauthConfig.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: body.toString(),
  });
  return await readTokenResponse(response);
}

export async function readTokenResponse(response: Response): Promise<TokenResponse> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new OAuthFlowError(
      'idp-error',
      `IdP returned non-JSON HTTP ${response.status}: ${text.slice(0, 200)}`,
    );
  }
  if (!response.ok) {
    const err = parsed as { error?: string; error_description?: string };
    const code = err.error ?? 'unknown';
    const desc = err.error_description ? `: ${err.error_description}` : '';
    throw new OAuthFlowError(
      'idp-error',
      `IdP rejected request (${response.status}): ${code}${desc}`,
      undefined,
      err,
    );
  }
  const ok = parsed as TokenResponse;
  if (typeof ok.access_token !== 'string' || ok.access_token.length === 0) {
    throw new OAuthFlowError('idp-error', 'token response missing access_token');
  }
  if (typeof ok.expires_in !== 'number' || ok.expires_in <= 0) {
    throw new OAuthFlowError('idp-error', 'token response missing valid expires_in');
  }
  return ok;
}

export function decodeIdTokenClaims(idToken: string): DecodedIdTokenClaims {
  const parts = idToken.split('.');
  if (parts.length < 2) return {};
  try {
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload) as DecodedIdTokenClaims;
  } catch {
    return {};
  }
}

export function tokenResponseToCredential(
  org: string,
  oauthConfig: OAuthConfig,
  token: TokenResponse,
  now: number,
): StoredOAuthCredential {
  const claims = token.id_token ? decodeIdTokenClaims(token.id_token) : {};
  const accountId = claims.oid ?? claims.preferred_username ?? claims.upn ?? claims.email ?? 'unknown';
  const issuedAt = Math.floor(now / 1000);
  return {
    kind: 'oauth',
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: issuedAt + token.expires_in,
    issuedAt,
    accountId,
    scope: token.scope ?? buildScopeString(oauthConfig.scopes),
    tenantId: oauthConfig.tenantId,
  };
}

export interface RunAuthCodeFlowResult {
  credential: StoredOAuthCredential;
  flowUsed: 'auth-code';
}

export async function runAuthCodeFlow(
  org: string,
  oauthConfig: OAuthConfig,
  deps: AuthCodeFlowDeps = {},
): Promise<RunAuthCodeFlowResult> {
  const fetchFn = deps.fetch ?? fetch;
  const open = deps.openUrl ?? openUrl;
  const now = deps.now ?? ((): number => Date.now());
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const listener = await openLoopbackListener(deps);
  // Use `localhost` (not `127.0.0.1`) and no path — matches the redirect-URI
  // whitelist of Microsoft's first-party Visual Studio public client which the
  // CLI uses by default. Both forms validate as loopback per RFC 8252; Entra's
  // wildcard port match works for either when the registered URI is the bare
  // loopback host.
  const redirectUri = `http://localhost:${listener.port}`;
  const session = prepareAuthCodeSession({ org, oauthConfig, redirectUri, now: now(), timeoutMs });

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const authUrl = buildAuthorizationUrl(session, oauthConfig);
    process.stderr.write(`Opening browser to authorise ${org} (loopback callback at ${redirectUri})…\n`);
    await open(authUrl);
    const cb = await listener.awaitCallback(session, ac.signal);
    const token = await exchangeCodeForToken(cb.code, session, oauthConfig, fetchFn);
    const credential = tokenResponseToCredential(org, oauthConfig, token, now());
    return { credential, flowUsed: 'auth-code' };
  } finally {
    clearTimeout(timer);
    await listener.close();
  }
}
