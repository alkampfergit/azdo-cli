import { Command } from 'commander';
import {
  promptForPat,
  validatePatAgainstAzdo,
  maskedDisplay,
  normalizePat,
} from '../services/auth.js';
import {
  getPat,
  storePat,
  deletePat,
  listOrgsWithStoredPat,
  probeBackend,
} from '../services/credential-store.js';
import { CredentialStoreUnavailableError } from '../types/credential.js';
import { resolveOrg, formatResolutionError } from '../services/org-resolver.js';
import { openUrl } from '../services/browser-open.js';
import { appendAuthAuditEvent, readAuditEvents } from '../services/audit-log.js';

type RootOptions = {
  org?: string;
  fromStdin?: boolean;
  browser?: boolean;
};

type GlobalsWithOrg = {
  org?: string;
};

async function readStdinToString(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function confirmOverwrite(org: string): Promise<boolean> {
  if (!process.stdin.isTTY) return true;
  process.stderr.write(`A PAT is already stored for org ${org}. Overwrite? [y/N] `);
  return await new Promise<boolean>((resolve) => {
    process.stdin.setEncoding('utf8');
    let answered = false;
    const handler = (data: string): void => {
      if (answered) return;
      answered = true;
      process.stdin.removeListener('data', handler);
      process.stdin.pause();
      const trimmed = data.trim().toLowerCase();
      resolve(trimmed === 'y' || trimmed === 'yes');
    };
    process.stdin.resume();
    process.stdin.on('data', handler);
  });
}

async function handleAuthRoot(options: RootOptions): Promise<void> {
  const resolved = resolveOrg({ org: options.org });
  if (!resolved) {
    process.stderr.write(`${formatResolutionError()}\n`);
    process.exitCode = 3;
    return;
  }
  const org = resolved.org;

  const wantBrowser = options.browser !== false && !options.fromStdin;
  if (wantBrowser) {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/_usersSettings/tokens`;
    await openUrl(url);
  }

  const raw: string | null = options.fromStdin ? await readStdinToString() : await promptForPat();
  const pat = raw ? normalizePat(raw) : null;
  if (!pat) {
    process.stderr.write('No PAT provided. Aborting.\n');
    process.exitCode = 1;
    return;
  }

  let validation;
  try {
    validation = await validatePatAgainstAzdo(pat, org);
  } catch (err) {
    process.stderr.write(`Could not reach Azure DevOps to validate PAT: ${(err as Error).message}\n`);
    process.exitCode = 1;
    return;
  }
  if (!validation.ok) {
    appendAuthAuditEvent({ event: 'auth.validate.fail', org, backend: probeBackend() });
    process.stderr.write(`PAT validation failed (HTTP ${validation.status}). Token NOT stored.\n`);
    process.exitCode = 2;
    return;
  }
  appendAuthAuditEvent({
    event: 'auth.validate.ok',
    org,
    backend: probeBackend(),
    masked_pat: maskedDisplay(pat),
  });

  try {
    const existing = await getPat(org);
    if (existing !== null) {
      const overwrite = await confirmOverwrite(org);
      if (!overwrite) {
        process.stderr.write('Aborted. Existing PAT preserved.\n');
        return;
      }
    }
    await storePat(org, pat);
  } catch (err) {
    if (err instanceof CredentialStoreUnavailableError) {
      process.stderr.write(`${err.message}\n`);
      process.exitCode = 4;
      return;
    }
    throw err;
  }

  process.stdout.write(`PAT stored for org ${org} in ${probeBackend()}.\n`);
}

async function handleStatus(options: { json?: boolean }, org: string): Promise<void> {
  let backend;
  let value: string | null;
  try {
    backend = probeBackend();
    value = await getPat(org);
  } catch (err) {
    if (err instanceof CredentialStoreUnavailableError) {
      process.stderr.write(`${err.message}\n`);
      process.exitCode = 4;
      return;
    }
    throw err;
  }

  const storedEvents = readAuditEvents().filter((ev) => ev.org === org && ev.event === 'auth.store');
  const last = storedEvents[storedEvents.length - 1];
  const updatedAt = last?.ts ?? null;

  if (!value) {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ org, backend, stored: false, masked: null, updated_at: updatedAt })}\n`,
      );
    } else {
      process.stdout.write(`Organization: ${org}\nBackend:      ${backend}\nStored:       no\n`);
    }
    process.exitCode = 1;
    return;
  }

  const masked = maskedDisplay(value);
  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({ org, backend, stored: true, masked, updated_at: updatedAt })}\n`,
    );
  } else {
    process.stdout.write(
      `Organization: ${org}\nBackend:      ${backend}\nStored:       yes\nIdentifier:   ${masked}\n` +
        (updatedAt ? `Last updated: ${updatedAt}\n` : ''),
    );
  }
}

async function handleLogout(options: { all?: boolean }, orgFromGlobal: string | undefined): Promise<void> {
  if (options.all && orgFromGlobal) {
    process.stderr.write('--org and --all are mutually exclusive.\n');
    process.exitCode = 1;
    return;
  }

  if (options.all) {
    let orgs: string[];
    try {
      orgs = await listOrgsWithStoredPat();
    } catch (err) {
      if (err instanceof CredentialStoreUnavailableError) {
        process.stderr.write(`${err.message}\n`);
        process.exitCode = 4;
        return;
      }
      throw err;
    }
    if (orgs.length === 0) {
      process.stdout.write('No stored PATs to remove.\n');
      return;
    }
    for (const org of orgs) {
      try {
        await deletePat(org);
        process.stdout.write(`PAT removed for org ${org}.\n`);
      } catch (err) {
        process.stderr.write(`Failed to remove PAT for org ${org}: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    }
    return;
  }

  const resolved = resolveOrg({ org: orgFromGlobal });
  if (!resolved) {
    process.stderr.write(`${formatResolutionError()}\n`);
    process.exitCode = 3;
    return;
  }

  try {
    const removed = await deletePat(resolved.org);
    if (removed) {
      process.stdout.write(`PAT removed for org ${resolved.org}.\n`);
    } else {
      process.stdout.write(`No stored PAT found for org ${resolved.org}.\n`);
    }
  } catch (err) {
    if (err instanceof CredentialStoreUnavailableError) {
      process.stderr.write(`${err.message}\n`);
      process.exitCode = 4;
      return;
    }
    throw err;
  }
}

export function createAuthCommand(): Command {
  const command = new Command('auth');
  command.description('Manage Azure DevOps Personal Access Tokens (PAT) in the OS secret vault');

  command
    .option('--org <name>', 'Azure DevOps organization (flag wins over auto-detect / config)')
    .option('--from-stdin', 'read PAT from stdin instead of prompting', false)
    .option('--no-browser', 'do not open the Azure DevOps PAT page in a browser');

  command.action(async (options: RootOptions) => {
    await handleAuthRoot(options);
  });

  const statusCmd = command
    .command('status')
    .description('Report whether a PAT is stored for the resolved org (masked, never the full value)')
    .option('--json', 'emit a JSON object', false);
  statusCmd.action(async (options: { json?: boolean }) => {
    const globals = statusCmd.optsWithGlobals() as GlobalsWithOrg;
    const resolved = resolveOrg({ org: globals.org });
    if (!resolved) {
      process.stderr.write(`${formatResolutionError()}\n`);
      process.exitCode = 3;
      return;
    }
    await handleStatus(options, resolved.org);
  });

  const logoutCmd = command
    .command('logout')
    .description('Remove the stored PAT for an org (or all orgs with --all)')
    .option('--all', 'remove the stored PAT for every org', false);
  logoutCmd.action(async (options: { all?: boolean }) => {
    const globals = logoutCmd.optsWithGlobals() as GlobalsWithOrg;
    await handleLogout(options, globals.org);
  });

  return command;
}
