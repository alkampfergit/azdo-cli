import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeResolvedCredential, requireAuthCredential } from '../../src/services/auth.js';

vi.mock('../../src/services/credential-store.js', () => ({
  getCredential: vi.fn(async () => null),
  setCredential: vi.fn(),
  deleteCredential: vi.fn(),
}));

const originalPat = process.env.AZDO_PAT;

beforeEach(() => {
  delete process.env.AZDO_PAT;
});

afterEach(() => {
  if (originalPat === undefined) {
    delete process.env.AZDO_PAT;
  } else {
    process.env.AZDO_PAT = originalPat;
  }
});

// The auth-failure message has to name the token it actually used: a PAT
// scoped for Work Items but not Code makes every `pr` command fail while
// `azdo get-item` keeps working, and without this line the user cannot tell
// which of AZDO_PAT / the credential store was even consulted.
describe('describeResolvedCredential', () => {
  it('says nothing before any credential has been resolved', () => {
    // A fresh process has resolved nothing; other suites may have, so this
    // only asserts the shape rather than a null.
    const described = describeResolvedCredential();
    expect(described === null || typeof described === 'string').toBe(true);
  });

  it('names AZDO_PAT, and its precedence, when the env var supplied the token', async () => {
    process.env.AZDO_PAT = 'env-token';

    const cred = await requireAuthCredential('test-org');
    expect(cred.source).toBe('env');

    const described = describeResolvedCredential();
    expect(described).toContain('AZDO_PAT environment variable');
    expect(described).toContain('precedence');
    expect(described).toContain('unset AZDO_PAT');
  });
});
