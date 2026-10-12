import { describe, expect, it } from 'vitest';
import { CredentialStoreUnavailableError } from '../../src/types/credential.js';

describe('CredentialStoreUnavailableError message', () => {
  it('includes the underlying cause', () => {
    const err = new CredentialStoreUnavailableError('macos-keychain', new Error('boom detail'));
    expect(err.message).toContain('Underlying error: boom detail');
    expect(err.cause).toBeInstanceOf(Error);
  });

  it('omits the line without a cause', () => {
    const err = new CredentialStoreUnavailableError('macos-keychain');
    expect(err.message).not.toContain('Underlying error');
  });

  it('redacts token-shaped text in the cause', () => {
    const secret = 'a1'.repeat(26);
    const err = new CredentialStoreUnavailableError('macos-keychain', new Error(`bad ${secret}`));
    expect(err.message).not.toContain(secret);
  });

  it('says unreachable and mentions AZDO_PAT on Linux', () => {
    const err = new CredentialStoreUnavailableError(
      'linux-libsecret',
      new Error('KeyRevoked: Operation not permitted'),
    );
    expect(err.message).toContain('missing or unreachable');
    expect(err.message).toContain('D-Bus');
    expect(err.message).toContain('AZDO_PAT');
    expect(err.message).toContain('Operation not permitted');
  });
});
