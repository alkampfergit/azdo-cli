import { routeAzureDevOpsApiUrl } from '../../src/services/azdo-client.js';
import { AZDO_ORG, AZDO_PAT } from './helpers/integration-utils.js';

// Answers that mean "the proxy has no (valid) PAT yet": Azure DevOps replies to
// bad credentials with a sign-in page (200/203), a redirect or 401/403.
const NOT_AUTHENTICATED = new Set([200, 203, 302, 401, 403]);

/**
 * In the dev container the tests carry only a placeholder PAT and Caddy adds
 * the real one. Until `fetch-pat.sh` has stored it, every live request would
 * fail with an authentication error, so probe once and, when the proxy cannot
 * authenticate or is unreachable, blank the PAT: the suites then skip like
 * they do without credentials (`SKIP_AZDO`). Any other answer (a proxy 404,
 * an upstream 5xx) is a real problem and fails the run. A no-op when
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

  let status = 0;
  let contentType = '';
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Basic ${basicToken}`, Accept: 'application/json' },
      redirect: 'manual',
    });
    status = response.status;
    contentType = response.headers.get('content-type') ?? '';
  } catch {
    // proxy unreachable: status stays 0
  }

  if (status === 200 && contentType.includes('application/json')) return;

  if (status !== 0 && !NOT_AUTHENTICATED.has(status)) {
    throw new Error(`[integration] proxy readiness probe failed unexpectedly: HTTP ${status} from ${url}`);
  }

  const reason = status === 0 ? 'unreachable' : 'HTTP ' + status;
  console.warn(
    `[integration] AZDO_API_BASE_URL is set but the proxy did not authenticate (${reason}); ` +
      'skipping live tests. Run fetch-pat.sh in the caddy container (docs/development.md).',
  );
  process.env.AZDO_PAT = '';
  delete process.env.AZDO_PATH;
}
