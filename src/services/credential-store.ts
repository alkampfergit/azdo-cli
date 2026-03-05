import { Entry } from '@napi-rs/keyring';

const SERVICE = 'azdo-cli';
const ACCOUNT = 'pat';

export async function getPat(): Promise<string | null> {
  try {
    const entry = new Entry(SERVICE, ACCOUNT);
    return entry.getPassword();
  } catch {
    return null;
  }
}

export async function storePat(pat: string): Promise<void> {
  try {
    const entry = new Entry(SERVICE, ACCOUNT);
    entry.setPassword(pat);
  } catch {
    // credential storage is best-effort; silently ignore errors
  }
}

export async function deletePat(): Promise<boolean> {
  try {
    const entry = new Entry(SERVICE, ACCOUNT);
    entry.deletePassword();
    return true;
  } catch {
    return false;
  }
}
