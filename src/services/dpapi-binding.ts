import { createRequire } from 'node:module';

export type DataProtectionScope = 'CurrentUser' | 'LocalMachine';

export interface DpapiBinding {
  protectData(data: Uint8Array, optionalEntropy: Uint8Array | null, scope: DataProtectionScope): Uint8Array;
  unprotectData(data: Uint8Array, optionalEntropy: Uint8Array | null, scope: DataProtectionScope): Uint8Array;
}

interface DpapiModule {
  isPlatformSupported: boolean;
  Dpapi: DpapiBinding;
}

let cached: DpapiBinding | null = null;

/**
 * Load the `@primno/dpapi` native addon on first use. It is only ever needed
 * when `credentialStore` is `dpapi`, so a keyring user never pays for (or can be
 * broken by) the load. The package is CommonJS, hence `createRequire`: the
 * credential store's entry points are synchronous.
 *
 * Throws when the addon is missing or has no binary for this platform — the
 * caller turns that into a CredentialStoreUnavailableError (exit 4).
 */
export function loadDpapi(): DpapiBinding {
  if (cached) return cached;
  const require = createRequire(import.meta.url);
  const mod = require('@primno/dpapi') as DpapiModule;
  if (!mod.isPlatformSupported) {
    throw new Error('the @primno/dpapi native binary is not available for this platform');
  }
  cached = mod.Dpapi;
  return cached;
}
