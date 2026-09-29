import { copyKeyringCredentialsToDpapi, listKeyringCredentials, type KeyringToDpapiCopy } from './credential-store.js';

/** `--copy-credentials` → `yes`, `--no-copy-credentials` → `no`, neither → `ask`. */
export type CopyChoice = 'yes' | 'no' | 'ask';

export interface DpapiCopyIo {
  /** Whether a y/n question can be asked (stdin and stderr are terminals). */
  interactive: boolean;
  ask(prompt: string): Promise<string>;
  /** Human-facing progress; stderr, so `--json` stdout stays one object. */
  notice(message: string): void;
}

export interface DpapiCopyOutcome extends KeyringToDpapiCopy {
  /** Orgs found in Credential Manager; empty when none, or when it was unreachable. */
  found: string[];
  keyringUnavailable: boolean;
}

const RERUN = 'azdo config set credentialStore dpapi --copy-credentials';

function isYes(answer: string): boolean {
  const a = answer.trim().toLowerCase();
  return a === '' || a === 'y' || a === 'yes';
}

function empty(found: string[], keyringUnavailable: boolean): DpapiCopyOutcome {
  return { found, keyringUnavailable, copied: [], skipped: [], failed: [] };
}

/**
 * After `credentialStore` is switched to `dpapi`: offer to copy the
 * credentials already in Credential Manager, so moving a machine to SSH use
 * does not mean logging in to every org again. Never throws — the setting is
 * already saved, and a copy problem is reported rather than undoing it.
 */
export async function offerKeyringToDpapiCopy(choice: CopyChoice, io: DpapiCopyIo): Promise<DpapiCopyOutcome> {
  if (choice === 'no') return empty([], false);

  let found: string[];
  try {
    found = listKeyringCredentials();
  } catch {
    io.notice(
      'Credential Manager is not reachable from this session (typical over SSH), so no existing credentials ' +
        `were copied. To bring them over, run \`${RERUN}\` once from a console session.\n`,
    );
    return empty([], true);
  }
  if (found.length === 0) return empty(found, false);

  const list = found.join(', ');
  if (choice === 'ask') {
    if (!io.interactive) {
      io.notice(`Credential Manager holds credentials for ${list}. Run \`${RERUN}\` to copy them to the DPAPI store.\n`);
      return empty(found, false);
    }
    const answer = await io.ask(`Copy the credentials for ${list} from Credential Manager to the DPAPI store? [Y/n] `);
    if (!isYes(answer)) {
      io.notice('Nothing copied. Run `azdo auth login` for each org, or re-run with --copy-credentials.\n');
      return empty(found, false);
    }
  }

  const result = copyKeyringCredentialsToDpapi(found);
  for (const org of result.copied) io.notice(`Copied the credential for ${org} to the DPAPI store.\n`);
  for (const org of result.skipped) io.notice(`Kept the existing DPAPI credential for ${org} (not overwritten).\n`);
  for (const { org, message } of result.failed) io.notice(`Could not copy the credential for ${org}: ${message}\n`);
  if (result.copied.length > 0) {
    io.notice('The Credential Manager entries were left in place; `credentialStore keyring` still finds them.\n');
  }
  return { found, keyringUnavailable: false, ...result };
}
