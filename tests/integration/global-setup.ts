import { routeAzureDevOpsApiUrl } from '../../src/services/azdo-client.js';
import { AZDO_ORG, AZDO_PAT } from './helpers/integration-utils.js';

// Answers that mean "the proxy has no (valid) PAT yet": Azure DevOps replies to
// bad credentials with a sign-in page (200/203), a redirect or 401/403.
const NOT_AUTHENTICATED = new Set([200, 203, 302, 401, 403]);

/**
 * In the dev container the tests carry only a placeholder PAT and Caddy adds
 * the real one. Until `fetch-pat.sh` has stored it, every live request would
 * fail with an authentication error, so probe once. When the proxy cannot
 * authenticate or is unreachable, warn and blank the PAT: the live suites then
 * skip like they do without credentials (`SKIP_AZDO`), so `npm test` still
 * works for a contributor without vault access. With `AZDO_REQUIRE_PROXY=1`
 * the same two cases fail the run instead. Any other answer (a proxy 404, an
 * upstream 5xx) is a real problem and always fails. A no-op when
 * AZDO_API_BASE_URL is unset.
 */
export default async function setup(): Promise<void> {
  if (!process.env.AZDO_API_BASE_URL?.trim()) return;

  // Same org and PAT as the suites (including the ../.env loader). The
  // organization field list is a Work Items endpoint, so the documented PAT
  // scopes cover it.
  const fieldsUrl = `https://dev.azure.com/${encodeURIComponent(AZDO_ORG)}/_apis/wit/fields?api-version=7.1`;
  // Throws INVALID_CONFIG for a malformed AZDO_API_BASE_URL: fail loudly.
  const url = routeAzureDevOpsApiUrl(fieldsUrl);
  const basicToken = Buffer.from(`:${AZDO_PAT}`).toString('base64');

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Basic ${basicToken}`, Accept: 'application/json' },
      redirect: 'manual',
    });
  } catch (error) {
    skipOrFail(`[integration] proxy readiness probe failed: proxy unreachable at ${url}`, error);
    return;
  }

  const status = response.status;
  const contentType = response.headers.get('content-type') ?? '';
  if (status === 200 && contentType.includes('application/json')) return;

  if (!NOT_AUTHENTICATED.has(status)) {
    throw new Error(`[integration] proxy readiness probe failed unexpectedly: HTTP ${status} from ${url}`);
  }

  skipOrFail(
    `[integration] proxy did not authenticate (HTTP ${status}); ` +
      'check the Caddy PAT and run fetch-pat.sh in the caddy container (docs/development.md).',
  );
}

/**
 * The proxy is not ready. Strict mode fails the run; otherwise the live
 * suites are skipped: the test workers start after this and inherit the env.
 */
function skipOrFail(message: string, cause?: unknown): void {
  if (process.env.AZDO_REQUIRE_PROXY?.trim() === '1') {
    throw new Error(message, { cause });
  }
  console.warn(`${message} Skipping the live suites; set AZDO_REQUIRE_PROXY=1 to fail instead.`);
  process.env.AZDO_PAT = '';
  delete process.env.AZDO_PATH;
}
