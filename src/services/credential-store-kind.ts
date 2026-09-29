import type { CredentialStoreKind } from '../types/work-item.js';

export const CREDENTIAL_STORES: readonly CredentialStoreKind[] = ['keyring', 'dpapi'];

/**
 * Validate a `credentialStore` value. `dpapi` is Windows' Data Protection API,
 * so choosing it anywhere else is refused up front rather than at first use.
 */
export function parseCredentialStore(value: string, platform: NodeJS.Platform = process.platform): CredentialStoreKind {
  const normalised = value.trim().toLowerCase();
  if (!(CREDENTIAL_STORES as readonly string[]).includes(normalised)) {
    throw new Error(`Invalid value "${value}" for credentialStore. Must be one of: ${CREDENTIAL_STORES.join(', ')}.`);
  }
  if (normalised === 'dpapi' && platform !== 'win32') {
    throw new Error('credentialStore "dpapi" is only available on Windows.');
  }
  return normalised as CredentialStoreKind;
}
