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

describe.skipIf(SKIP_LINUX)('credential-store integration', () => {
  // Clean up any leftover entry before and after the suite.
  beforeAll(async () => {
    await deletePat();
  });

  afterAll(async () => {
    await deletePat();
  });

  it('returns null when no PAT is stored', async () => {
    const result = await getPat();
    expect(result).toBeNull();
  });

  it('stores and retrieves a PAT', async () => {
    await storePat('test-pat-value');
    const result = await getPat();
    expect(result).toBe('test-pat-value');
  });

  it('overwrites an existing PAT', async () => {
    await storePat('first-pat');
    await storePat('second-pat');
    const result = await getPat();
    expect(result).toBe('second-pat');
  });

  it('deletes the PAT and returns true', async () => {
    await storePat('to-be-deleted');
    const deleted = await deletePat();
    expect(deleted).toBe(true);
  });

  it('returns null after deletion', async () => {
    await storePat('to-be-deleted');
    await deletePat();
    const result = await getPat();
    expect(result).toBeNull();
  });

  it('returns platform-appropriate value when deleting a non-existent PAT', async () => {
    // Ensure nothing is stored first.
    await deletePat();
    const deleted = await deletePat();

    if (process.platform === 'win32') {
      // Windows Credential Manager throws when the entry does not exist.
      expect(deleted).toBe(false);
    } else {
      // macOS Keychain and Linux Secret Service silently succeed.
      expect(deleted).toBe(true);
    }
  });
});
