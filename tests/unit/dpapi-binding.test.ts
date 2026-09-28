import { describe, expect, it } from 'vitest';
import { loadDpapi } from '../../src/services/dpapi-binding.js';

describe.skipIf(process.platform === 'win32')('loadDpapi off Windows', () => {
  it('throws instead of handing back a binding that cannot encrypt', () => {
    expect(() => loadDpapi()).toThrow(/not available for this platform/);
  });
});

describe.skipIf(process.platform !== 'win32')('loadDpapi on Windows', () => {
  it('round-trips through the real CryptProtectData', () => {
    const dpapi = loadDpapi();
    const entropy = Buffer.from('azdo-cli:test');
    const blob = dpapi.protectData(Buffer.from('secret'), entropy, 'CurrentUser');
    expect(Buffer.from(dpapi.unprotectData(blob, entropy, 'CurrentUser')).toString()).toBe('secret');
  });
});
