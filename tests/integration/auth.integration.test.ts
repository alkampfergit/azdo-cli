import { afterAll, describe, expect, it } from 'vitest';
import { INTEGRATION_ENABLED } from './helpers/skip-unless-integration.js';
import {
  getPat,
  storePat,
  deletePat,
  listOrgsWithStoredPat,
  probeBackend,
} from '../../src/services/credential-store.js';

const TEST_ORG = `azdo-cli-integration-${process.pid}`;
const TEST_PAT = 'integration-fake-token-do-not-use';

describe.skipIf(!INTEGRATION_ENABLED)('credential-store integration (real OS keyring)', () => {
  // Cleanup lives inside the gated suite: an `afterAll` at file scope would run
  // — and touch the real OS keyring — on every ordinary test run, which is
  // exactly what the `AZDO_INTEGRATION` opt-in exists to prevent.
  afterAll(async () => {
    try {
      await deletePat(TEST_ORG);
    } catch {
      // best-effort cleanup
    }
  });

  it('round-trips a PAT through the real keyring', async () => {
    const backend = probeBackend();
    expect(['windows-credential-manager', 'macos-keychain', 'linux-libsecret']).toContain(backend);

    await storePat(TEST_ORG, TEST_PAT);

    const fetched = await getPat(TEST_ORG);
    expect(fetched).toBe(TEST_PAT);

    const orgs = await listOrgsWithStoredPat();
    expect(orgs).toContain(TEST_ORG);

    const removed = await deletePat(TEST_ORG);
    expect(removed).toBe(true);

    const gone = await getPat(TEST_ORG);
    expect(gone).toBeNull();
  });
});
