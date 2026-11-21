import { routeAzureDevOpsApiUrl } from '../../src/services/azdo-client.js';

/**
 * In the dev container the tests carry only a placeholder PAT and Caddy adds
 * the real one. Until `fetch-pat.sh` has stored it, every live request would
 * fail with an authentication error, so probe once and, when the proxy cannot
 * authenticate, blank the PAT: the suites then skip like they do without
 * credentials (`SKIP_AZDO`). A no-op when AZDO_API_BASE_URL is unset.
 */
export default async function setup(): Promise<void> {
  if (!process.env.AZDO_API_BASE_URL?.trim()) return;

  const org = (process.env.AZDO_ORG ?? 'gianmariaricci').trim();
  const pat = process.env.AZDO_PAT ?? process.env.AZDO_PATH ?? '';
  // Throws INVALID_CONFIG for a malformed AZDO_API_BASE_URL: fail loudly.
  const url = routeAzureDevOpsApiUrl(
    `https://dev.azure.com/${encodeURIComponent(org)}/_apis/projects?$top=1&api-version=7.1`,
  );

  let status = 0;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Basic ${Buffer.from(`:${pat}`).toString('base64')}` },
      redirect: 'manual',
    });
    status = response.status;
  } catch {
    // proxy unreachable: status stays 0
  }

  if (status !== 200) {
    console.warn(
      `[integration] AZDO_API_BASE_URL is set but the proxy did not authenticate (${status === 0 ? 'unreachable' : `HTTP ${status}`}); ` +
        'skipping live tests. Run fetch-pat.sh in the caddy container (docs/development.md).',
    );
    process.env.AZDO_PAT = '';
    delete process.env.AZDO_PATH;
  }
}
