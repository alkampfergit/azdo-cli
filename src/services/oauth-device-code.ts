import { buildScopeString } from './oauth-config.js';
import { readTokenResponse, tokenResponseToCredential } from './oauth-flow.js';
import type { DeviceCodeResponse, OAuthConfig, TokenResponse } from '../types/oauth.js';
import type { StoredOAuthCredential } from '../types/credential.js';

export class DeviceCodeFlowError extends Error {
  readonly reason: 'expired_token' | 'access_denied' | 'idp-error' | 'timeout';
  constructor(reason: DeviceCodeFlowError['reason'], message: string, cause?: unknown) {
    super(message);
    this.name = 'DeviceCodeFlowError';
    this.reason = reason;
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

export interface DeviceCodeFlowDeps {
  fetch?: typeof fetch;
  /** Override "now" for tests (Date.now in ms). */
  now?: () => number;
  /** Override the inter-poll sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Override the writer for the user-code prompt (default = process.stderr.write). */
  writePrompt?: (msg: string) => void;
}

const MIN_INTERVAL_SEC = 5;

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function requestDeviceCode(
  oauthConfig: OAuthConfig,
  fetchFn: typeof fetch,
): Promise<DeviceCodeResponse> {
  const body = new URLSearchParams({
    client_id: oauthConfig.clientId,
    scope: buildScopeString(oauthConfig.scopes),
  });
  const response = await fetchFn(oauthConfig.deviceCodeEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: body.toString(),
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DeviceCodeFlowError('idp-error', `device-code endpoint returned non-JSON HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    const err = parsed as { error?: string; error_description?: string };
    throw new DeviceCodeFlowError(
      'idp-error',
      `device-code endpoint rejected request (${response.status}): ${err.error ?? 'unknown'}${err.error_description ? `: ${err.error_description}` : ''}`,
    );
  }
  return parsed as DeviceCodeResponse;
}

export async function pollForDeviceToken(
  deviceCode: string,
  oauthConfig: OAuthConfig,
  initialIntervalSec: number,
  expiresAtMs: number,
  deps: DeviceCodeFlowDeps,
): Promise<TokenResponse> {
  const fetchFn = deps.fetch ?? fetch;
  const now = deps.now ?? ((): number => Date.now());
  const sleep = deps.sleep ?? defaultSleep;

  let intervalSec = Math.max(MIN_INTERVAL_SEC, initialIntervalSec);

  for (;;) {
    if (now() >= expiresAtMs) {
      throw new DeviceCodeFlowError('expired_token', 'device-code flow expired before authorisation completed');
    }
    await sleep(intervalSec * 1000);

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: oauthConfig.clientId,
      device_code: deviceCode,
    });
    const response = await fetchFn(oauthConfig.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: body.toString(),
    });
    if (response.ok) {
      return await readTokenResponse(response);
    }
    // Pending / slow_down / final error
    const text = await response.text();
    let parsed: { error?: string; error_description?: string };
    try {
      parsed = JSON.parse(text) as { error?: string; error_description?: string };
    } catch {
      throw new DeviceCodeFlowError('idp-error', `non-JSON HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    const errCode = parsed.error ?? '';
    if (errCode === 'authorization_pending') {
      // keep polling at the same interval
      continue;
    }
    if (errCode === 'slow_down') {
      // RFC 8628 §3.5 — increment interval by 5s
      intervalSec += 5;
      continue;
    }
    if (errCode === 'expired_token') {
      throw new DeviceCodeFlowError('expired_token', 'device code expired before authorisation completed');
    }
    if (errCode === 'access_denied') {
      throw new DeviceCodeFlowError('access_denied', 'authorisation denied by user');
    }
    throw new DeviceCodeFlowError(
      'idp-error',
      `IdP rejected device-token poll (${response.status}): ${errCode}${parsed.error_description ? `: ${parsed.error_description}` : ''}`,
    );
  }
}

export interface RunDeviceCodeFlowResult {
  credential: StoredOAuthCredential;
  flowUsed: 'device-code';
}

export async function runDeviceCodeFlow(
  org: string,
  oauthConfig: OAuthConfig,
  deps: DeviceCodeFlowDeps = {},
): Promise<RunDeviceCodeFlowResult> {
  const fetchFn = deps.fetch ?? fetch;
  const now = deps.now ?? ((): number => Date.now());
  const writePrompt = deps.writePrompt ?? ((m: string): void => {
    process.stderr.write(m);
  });

  const dc = await requestDeviceCode(oauthConfig, fetchFn);
  writePrompt(
    `\nTo authenticate, open ${dc.verification_uri} in a browser and enter the code:\n\n    ${dc.user_code}\n\nWaiting for authorisation (expires in ${Math.round(dc.expires_in / 60)} min)…\n`,
  );

  const expiresAtMs = now() + dc.expires_in * 1000;
  const token = await pollForDeviceToken(dc.device_code, oauthConfig, dc.interval, expiresAtMs, deps);
  const credential = tokenResponseToCredential(org, oauthConfig, token, now());
  return { credential, flowUsed: 'device-code' };
}
