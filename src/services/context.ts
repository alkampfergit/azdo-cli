import type { AzdoContext } from '../types/work-item.js';
import { detectAzdoContext } from './git-remote.js';
import { loadConfig } from './config-store.js';
import { resolveOrg, formatResolutionError } from './org-resolver.js';

export function resolveContext(options: { org?: string; project?: string }): AzdoContext {
  const resolvedOrg = resolveOrg({ org: options.org });

  let gitContext: AzdoContext | null = null;
  try {
    gitContext = detectAzdoContext();
  } catch {
    // not in an Azure DevOps git repo
  }

  const config = loadConfig();

  const org = resolvedOrg?.org;
  const project =
    options.project ||
    (gitContext?.project && gitContext.project.length > 0 ? gitContext.project : undefined) ||
    config.project;

  if (org && project) {
    return { org, project };
  }

  if (!org) {
    throw new Error(formatResolutionError());
  }

  throw new Error(
    'Could not determine org/project. Use --org and --project flags, work from an Azure DevOps git repo, or run "azdo config set org/project".',
  );
}
