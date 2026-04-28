import { Command } from 'commander';
import {
  promptForPat,
  validatePatAgainstAzdo,
  maskedDisplay,
  normalizePat,
  loginWithOAuth,
  logout as logoutService,
  status as statusService,
  type OAuthLoginOptions,
} from '../services/auth.js';
import {
  getPat,
  getStoredCredential,
  storePat,
  deletePat,
  probeBackend,
} from '../services/credential-store.js';
import { CredentialStoreUnavailableError } from '../types/credential.js';
import { resolveOrg, formatResolutionError } from '../services/org-resolver.js';
import { openUrl } from '../services/browser-open.js';
import { appendAuthAuditEvent, readAuditEvents } from '../services/audit-log.js';
import { defaultScopes } from '../services/oauth-config.js';

type RootOptions = {
  org?: string;
  fromStdin?: boolean;
  browser?: boolean;
  usePat?: boolean;
  deviceCode?: boolean;
  clientId?: string;
  tenantId?: string;
  scopes?: string;
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

async function promptYesNo(prompt: string): Promise<boolean> {
  if (!process.stdin.isTTY) return true;
  process.stderr.write(prompt);
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

async function confirmOverwrite(org: string): Promise<boolean> {
  return promptYesNo(`A PAT is already stored for org ${org}. Overwrite? [y/N] `);
}

async function confirmOverwriteCredential(org: string, existingKind: 'pat' | 'oauth'): Promise<boolean> {
  const label = existingKind === 'oauth' ? 'OAuth credential' : 'PAT';
  return promptYesNo(`A ${label} is already stored for org ${org}. The new login will replace it. Continue? [y/N] `);
}

function rejectMutuallyExclusive(opts: RootOptions): string | null {
  if (opts.usePat && opts.deviceCode) {
    return '--use-pat and --device-code are mutually exclusive (PAT has no device-code flow).';
  }
  if (opts.usePat && (opts.clientId || opts.tenantId || opts.scopes)) {
    return '--use-pat cannot be combined with OAuth-only flags (--client-id / --tenant-id / --scopes).';
  }
  return null;
}

async function handlePatLogin(options: RootOptions): Promise<void> {
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
        process.exitCode = 1;
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

async function ensureOverwriteConfirmed(org: string): Promise<'ok' | 'aborted' | 'unavailable'> {
  try {
    const existing = await getStoredCredential(org);
    if (existing === null || !process.stdin.isTTY) return 'ok';
    const ok = await confirmOverwriteCredential(org, existing.kind);
    return ok ? 'ok' : 'aborted';
  } catch (err) {
    if (err instanceof CredentialStoreUnavailableError) {
      process.stderr.write(`${err.message}\n`);
      return 'unavailable';
    }
    throw err;
  }
}

function buildOAuthLoginOptions(options: RootOptions): OAuthLoginOptions {
  return {
    flow: options.deviceCode ? 'device-code' : 'auto',
    clientIdOverride: options.clientId,
    tenantIdOverride: options.tenantId,
    scopesOverride: options.scopes ? options.scopes.split(/\s+/).filter(Boolean) : undefined,
  };
}

function reportOAuthFailure(err: unknown): void {
  const reason =
    typeof err === 'object' && err !== null && 'reason' in err
      ? (err as { reason: string }).reason
      : null;
  const msg = (err as Error).message;
  process.stderr.write(reason ? `OAuth login failed (${reason}): ${msg}\n` : `OAuth login failed: ${msg}\n`);
  const noDisplay =
    process.platform === 'linux' && (!process.env.DISPLAY || process.env.DISPLAY.length === 0);
  if (noDisplay) {
    process.stderr.write('Tip: this host has no DISPLAY; pass --device-code to use the headless flow.\n');
  } else if (reason === 'port-conflict') {
    process.stderr.write('Tip: another process is using the loopback callback port. Try again or pass --device-code.\n');
  }
}

async function handleOAuthLogin(options: RootOptions): Promise<void> {
  const resolved = resolveOrg({ org: options.org });
  if (!resolved) {
    process.stderr.write(`${formatResolutionError()}\n`);
    process.exitCode = 3;
    return;
  }
  const org = resolved.org;

  // Honour the loginWithOAuth contract: confirm before overwriting an existing
  // stored credential. On a non-TTY (CI / scripted use) we proceed without
  // prompting — the caller has already opted in by invoking the command.
  const confirm = await ensureOverwriteConfirmed(org);
  if (confirm === 'aborted') {
    process.stderr.write('Aborted. Existing credential preserved.\n');
    process.exitCode = 1;
    return;
  }
  if (confirm === 'unavailable') {
    process.exitCode = 4;
    return;
  }

  try {
    const result = await loginWithOAuth(org, buildOAuthLoginOptions(options));
    process.stdout.write(
      `Logged in to ${org} via OAuth (${result.flowUsed}). Account: ${result.accountId}; expires ${new Date(result.expiresAt * 1000).toISOString()}.\n`,
    );
  } catch (err) {
    reportOAuthFailure(err);
    process.exitCode = 1;
  }
}

async function handleAuthRoot(options: RootOptions): Promise<void> {
  const conflict = rejectMutuallyExclusive(options);
  if (conflict) {
    process.stderr.write(`${conflict}\n`);
    process.exitCode = 2;
    return;
  }
  // Root `azdo auth` (no subcommand) keeps the legacy PAT-prompt behaviour for
  // back-compat. Use `azdo auth login` for the OAuth-default flow per FR-012.
  await handlePatLogin(options);
}

async function handleLoginSubcommand(options: RootOptions): Promise<void> {
  const conflict = rejectMutuallyExclusive(options);
  if (conflict) {
    process.stderr.write(`${conflict}\n`);
    process.exitCode = 2;
    return;
  }
  if (options.fromStdin || options.usePat) {
    await handlePatLogin(options);
    return;
  }
  await handleOAuthLogin(options);
}

async function handleStatusJson(): Promise<void> {
  try {
    const report = await statusService();
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch (err) {
    if (err instanceof CredentialStoreUnavailableError) {
      process.stderr.write(`${err.message}\n`);
      process.exitCode = 4;
      return;
    }
    throw err;
  }
}

async function handleStatus(options: { json?: boolean }, org: string): Promise<void> {
  if (options.json) {
    // Honour the original single-org JSON shape for back-compat with existing callers
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
    const last = storedEvents.at(-1);
    const updatedAt = last?.ts ?? null;
    if (!value) {
      process.stdout.write(
        `${JSON.stringify({ org, backend, stored: false, masked: null, updated_at: updatedAt })}\n`,
      );
      process.exitCode = 1;
      return;
    }
    const masked = maskedDisplay(value);
    process.stdout.write(
      `${JSON.stringify({ org, backend, stored: true, masked, updated_at: updatedAt })}\n`,
    );
    return;
  }

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
  const last = storedEvents.at(-1);
  const updatedAt = last?.ts ?? null;

  if (!value) {
    process.stdout.write(`Organization: ${org}\nBackend:      ${backend}\nStored:       no\n`);
    process.exitCode = 1;
    return;
  }

  const masked = maskedDisplay(value);
  process.stdout.write(
    `Organization: ${org}\nBackend:      ${backend}\nStored:       yes\nIdentifier:   ${masked}\n` +
      (updatedAt ? `Last updated: ${updatedAt}\n` : ''),
  );
}

async function handleLogout(options: { all?: boolean }, orgFromGlobal: string | undefined): Promise<void> {
  if (options.all && orgFromGlobal) {
    process.stderr.write('--org and --all are mutually exclusive.\n');
    process.exitCode = 1;
    return;
  }

  if (options.all) {
    try {
      const result = await logoutService({ all: true });
      if (result.removed.length === 0) {
        process.stdout.write('No stored credentials to remove.\n');
        return;
      }
      for (const r of result.removed) {
        process.stdout.write(`Removed ${r.kind} credential for org ${r.org}.\n`);
      }
    } catch (err) {
      if (err instanceof CredentialStoreUnavailableError) {
        process.stderr.write(`${err.message}\n`);
        process.exitCode = 4;
        return;
      }
      process.stderr.write(`Failed to remove credentials: ${(err as Error).message}\n`);
      process.exitCode = 1;
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
      process.stdout.write(`Credential removed for org ${resolved.org}.\n`);
    } else {
      process.stdout.write(`No stored credential for org ${resolved.org}.\n`);
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
  command.description(
    'Manage Azure DevOps authentication. Use `azdo auth login` for OAuth (default); the bare `azdo auth` form preserves the legacy PAT-prompt path for back-compat.',
  );

  command
    .option('--org <name>', 'Azure DevOps organization (flag wins over auto-detect / config)')
    .option('--from-stdin', 'read PAT from stdin instead of prompting (implies --use-pat)', false)
    .option('--no-browser', 'do not open the Azure DevOps PAT page in a browser (PAT path only)')
    .option('--use-pat', 'use Personal Access Token instead of OAuth (legacy path)', false)
    .option('--device-code', 'use OAuth device-code flow (headless hosts; OAuth only)', false)
    .option('--client-id <id>', 'override the default OAuth client id (FR-013 override path)')
    .option('--tenant-id <id>', 'override the default OAuth tenant id (default: organizations)')
    .option('--scopes <scopes>', 'space-separated OAuth scope override (advanced; default mirrors PAT scope table)');

  command
    .addHelpText(
      'after',
      `
Default flow (OAuth, browser-based):
  azdo auth login --org <name>
  → opens the default browser for OAuth (Microsoft Entra v2 + PKCE).

Headless / no-browser:
  azdo auth login --org <name> --device-code

PAT path (legacy, opt-in):
  azdo auth login --org <name> --use-pat
  azdo auth --org <name>            # back-compat alias of the above

OAuth scope set requested by default (FR-016, mirrors PAT scope table):
  ${defaultScopes().join('\n  ')}

For self-registered OAuth apps (locked-down tenants), see docs/oauth-app-registration.md
— that same guide is the maintainer reference for the project's shared client id.

Note: stored credentials may coexist as 'pat' or 'oauth' across orgs (FR-007).
Note: \`azdo auth\` (no subcommand) preserves the legacy PAT-prompt entry point;
      \`azdo auth login\` is the spec-canonical name and defaults to OAuth.`,
    )
    .action(async (options: RootOptions) => {
      await handleAuthRoot(options);
    });

  // `azdo auth login` is the spec-canonical name; OAuth is the default per FR-012.
  // All flags are inherited from the parent root command via optsWithGlobals();
  // we only re-declare `--org` so it can be passed in either position.
  const loginCmd = command
    .command('login')
    .description('Authenticate against Azure DevOps (OAuth default; --use-pat for PAT)')
    .option('--org <name>', 'Azure DevOps organization (defaults: git remote → config)');
  loginCmd.action(async () => {
    const merged = loginCmd.optsWithGlobals() as GlobalsWithOrg & RootOptions;
    await handleLoginSubcommand(merged);
  });

  const statusCmd = command
    .command('status')
    .description('Report stored credentials (kind, org, account/expiry, backend) — never the token')
    .option('--json', 'emit JSON', false);
  statusCmd.action(async (options: { json?: boolean }) => {
    const globals = statusCmd.optsWithGlobals() as GlobalsWithOrg;
    if (!globals.org) {
      // No org → emit aggregate status across all stored orgs
      if (options.json) {
        await handleStatusJson();
        return;
      }
      const report = await statusService();
      if (report.orgs.length === 0) {
        process.stdout.write('No stored credentials.\n');
        return;
      }
      for (const e of report.orgs) {
        const expiry = e.expiresAt ? new Date(e.expiresAt * 1000).toISOString() : 'n/a';
        process.stdout.write(
          `${e.org}\t${e.kind}\t${e.accountId ?? ''}\t${expiry}\n`,
        );
      }
      return;
    }
    const resolved = resolveOrg({ org: globals.org });
    if (!resolved) {
      process.stderr.write(`${formatResolutionError()}\n`);
      process.exitCode = 3;
      return;
    }
    await handleStatus(options, resolved.org);
  });
  statusCmd.addHelpText(
    'after',
    '\nStored credentials may be of kind `pat` or `oauth` and may coexist across orgs (FR-007).\n',
  );

  const logoutCmd = command
    .command('logout')
    .description('Remove the stored credential for an org (or all orgs with --all)')
    .option('--all', 'remove every stored credential (PAT and OAuth)', false);
  logoutCmd.action(async (options: { all?: boolean }) => {
    const globals = logoutCmd.optsWithGlobals() as GlobalsWithOrg;
    await handleLogout(options, globals.org);
  });

  return command;
}
