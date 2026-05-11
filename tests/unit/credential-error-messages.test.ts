import { describe, expect, it } from 'vitest';
import { CredentialRefreshError, CredentialMissingError } from '../../src/types/credential.js';

describe('CredentialMissingError — userMessage points to the canonical command', () => {
  it("references `azdo auth login` (not the legacy `azdo login`)", () => {
    const err = new CredentialMissingError('myorg');
    expect(err.message).toContain('azdo auth login --org myorg');
  });
});

describe('CredentialRefreshError.userMessage — reason-aware', () => {
  it('non-network reasons (revoked / window-exceeded / invalid-grant / unknown) tell the user to re-authorise', () => {
    for (const reason of ['revoked', 'window-exceeded', 'invalid-grant', 'unknown'] as const) {
      const err = new CredentialRefreshError('myorg', reason);
      expect(err.userMessage).toContain('Refresh token rejected');
      expect(err.userMessage).toContain('azdo auth login --org myorg');
      expect(err.userMessage).toContain('preserved');
    }
  });

  it('network reason suggests retrying / checking connectivity instead of re-authorising', () => {
    const err = new CredentialRefreshError('myorg', 'network');
    expect(err.userMessage).toContain('network');
    expect(err.userMessage).toContain('retry');
    expect(err.userMessage).not.toContain('Refresh token rejected');
    expect(err.userMessage).toContain('preserved');
  });

  it('userMessage equals .message (so callers printing either get the same text)', () => {
    const err = new CredentialRefreshError('myorg', 'revoked');
    expect(err.userMessage).toBe(err.message);
  });
});
