import type { ResolveOrgOptions, ResolvedOrg } from '../types/org.js';
import { detectAzdoContext } from './git-remote.js';
import { loadConfig } from './config-store.js';

function defaultDetectFromGit(): string | null {
  try {
    return detectAzdoContext().org ?? null;
  } catch {
    return null;
  }
}

function defaultReadConfig(): { org?: string } {
  return loadConfig();
}

export function resolveOrg(options: ResolveOrgOptions): ResolvedOrg | null {
  if (options.org && options.org.length > 0) {
    return { org: options.org, source: 'flag' };
  }

  const gitOrg = (options.detectFromGit ?? defaultDetectFromGit)();
  if (gitOrg && gitOrg.length > 0) {
    return { org: gitOrg, source: 'git' };
  }

  const configOrg = (options.readConfig ?? defaultReadConfig)().org;
  if (configOrg && configOrg.length > 0) {
    return { org: configOrg, source: 'config' };
  }

  return null;
}

export function formatResolutionError(): string {
  return [
    'Could not resolve an Azure DevOps organization. Options (in priority order):',
    '  1. Pass --org <name> on the command line.',
    '  2. Run this command from a git repo whose origin remote is an Azure DevOps URL.',
    '  3. Run `azdo config set org <name>` once to set a persistent default.',
  ].join('\n');
}
