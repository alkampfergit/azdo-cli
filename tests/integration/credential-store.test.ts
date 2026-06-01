/**
 * Integration tests for credential-store.ts.
 *
 * These tests hit the real OS keychain (Windows Credential Manager, macOS
 * Keychain, or Linux Secret Service) and are therefore environment-dependent.
 * Run them explicitly with:
 *
 *   npm run test:integration
 *
 * They are intentionally excluded from the standard `npm test` run.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deletePat, getPat, storePat } from '../../src/services/credential-store.js';

const SKIP_LINUX = process.platform === 'linux';

const TEST_ORG = 'azdo-cli-it-test';

describe.skipIf(SKIP_LINUX)('credential-store integration', () => {
  // Clean up any leftover entry before and after the suite.
  beforeAll(async () => {
    await deletePat(TEST_ORG);
  });

  afterAll(async () => {
    await deletePat(TEST_ORG);
  });

  it('returns null when no PAT is stored', async () => {
    const result = await getPat(TEST_ORG);
    expect(result).toBeNull();
  });

  it('stores and retrieves a PAT', async () => {
    await storePat(TEST_ORG, 'test-pat-value');
    const result = await getPat(TEST_ORG);
    expect(result).toBe('test-pat-value');
  });

  it('overwrites an existing PAT', async () => {
    await storePat(TEST_ORG, 'first-pat');
    await storePat(TEST_ORG, 'second-pat');
    const result = await getPat(TEST_ORG);
    expect(result).toBe('second-pat');
  });

  it('deletes the PAT and returns true', async () => {
    await storePat(TEST_ORG, 'to-be-deleted');
    const deleted = await deletePat(TEST_ORG);
    expect(deleted).toBe(true);
  });

  it('returns null after deletion', async () => {
    await storePat(TEST_ORG, 'to-be-deleted');
    await deletePat(TEST_ORG);
    const result = await getPat(TEST_ORG);
    expect(result).toBeNull();
  });

  it('returns platform-appropriate value when deleting a non-existent PAT', async () => {
    // Ensure nothing is stored first.
    await deletePat(TEST_ORG);
    const deleted = await deletePat(TEST_ORG);

    if (process.platform === 'win32') {
      // Windows Credential Manager throws when the entry does not exist.
      expect(deleted).toBe(false);
    } else {
      // macOS Keychain and Linux Secret Service silently succeed.
      expect(deleted).toBe(true);
    }
  });
});
