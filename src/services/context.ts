import type { AzdoContext } from '../types/work-item.js';
import { detectAzdoContext } from './git-remote.js';
import { loadConfig } from './config-store.js';

export function resolveContext(options: { org?: string; project?: string }): AzdoContext {
  if (options.org && options.project) {
    return { org: options.org, project: options.project };
  }

  const config = loadConfig();
  if (config.org && config.project) {
    return { org: config.org, project: config.project };
  }

  let gitContext: AzdoContext | null = null;
  try {
    gitContext = detectAzdoContext();
  } catch {
    // not in a git repo or not an azdo remote
  }

  const org = config.org || gitContext?.org;
  const project = config.project || gitContext?.project;

  if (org && project) {
    return { org, project };
  }

  throw new Error(
    'Could not determine org/project. Use --org and --project flags, work from an Azure DevOps git repo, or run "azdo config set org/project".',
  );
}
