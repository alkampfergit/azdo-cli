import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  getStoredCredential: vi.fn(),
  deletePat: vi.fn(),
  listOrgsWithStoredPat: vi.fn(),
}));

vi.mock('../../src/services/credential-store.js', () => ({
  ...store,
  storeOAuthCredential: vi.fn(),
  probeBackend: vi.fn(() => 'keyring'),
}));

vi.mock('../../src/services/audit-log.js', () => ({
  appendAuthAuditEvent: vi.fn(),
}));

import { logout } from '../../src/services/auth.js';

describe('logout --all', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.listOrgsWithStoredPat.mockResolvedValue(['orgA', 'orgB', 'orgC']);
    store.deletePat.mockResolvedValue(true);
  });

  it('removes every org in order and reports each one', async () => {
    store.getStoredCredential.mockImplementation(async (org: string) =>
      org === 'orgB' ? { kind: 'oauth' } : { kind: 'pat', token: 't' },
    );

    const result = await logout({ all: true });

    expect(result.removed).toEqual([
      { org: 'orgA', kind: 'pat' },
      { org: 'orgB', kind: 'oauth' },
      { org: 'orgC', kind: 'pat' },
    ]);
    expect(store.deletePat.mock.calls.map(([org]) => org)).toEqual(['orgA', 'orgB', 'orgC']);
  });

  it('stops before touching later orgs when one credential cannot be read', async () => {
    store.getStoredCredential.mockImplementation(async (org: string) => {
      if (org === 'orgB') throw new Error('invalid credential envelope');
      return { kind: 'pat', token: 't' };
    });

    await expect(logout({ all: true })).rejects.toThrow('invalid credential envelope');
    expect(store.deletePat.mock.calls.map(([org]) => org)).toEqual(['orgA']);
    expect(store.getStoredCredential).not.toHaveBeenCalledWith('orgC');
  });
});
