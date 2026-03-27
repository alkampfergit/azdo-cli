import { execSync } from 'node:child_process';
import type { AzdoContext } from '../types/work-item.js';

const patterns: RegExp[] = [
  // HTTPS (current): https://dev.azure.com/{org}/{project}/_git/{repo}
  /^https?:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)$/,
  // HTTPS (legacy + DefaultCollection): https://{org}.visualstudio.com/DefaultCollection/{project}/_git/{repo}
  /^https?:\/\/([^.]+)\.visualstudio\.com\/DefaultCollection\/([^/]+)\/_git\/([^/]+)$/,
  // HTTPS (legacy): https://{org}.visualstudio.com/{project}/_git/{repo}
  /^https?:\/\/([^.]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/]+)$/,
  // SSH (current): git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
  /^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+)$/,
  // SSH (legacy): {org}@vs-ssh.visualstudio.com:v3/{org}/{project}/{repo}
  /^[^@]+@vs-ssh\.visualstudio\.com:v3\/([^/]+)\/([^/]+)\/([^/]+)$/,
];

export function parseAzdoRemote(url: string): AzdoContext | null {
  for (const pattern of patterns) {
    const match = pattern.exec(url);
    if (match) {
      const project = match[2];
      // DefaultCollection is not a real project — skip this match
      if (/^DefaultCollection$/i.test(project)) {
        return { org: match[1], project: '' };
      }
      return { org: match[1], project: project };
    }
  }
  return null;
}

export function detectAzdoContext(): AzdoContext {
  let remoteUrl: string;
  try {
    remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
  } catch {
    throw new Error('Not in a git repository. Provide --org and --project explicitly.');
  }

  const context = parseAzdoRemote(remoteUrl);
  if (!context || (!context.org && !context.project)) {
    throw new Error('Git remote "origin" is not an Azure DevOps URL. Provide --org and --project explicitly.');
  }

  return context;
}

export function parseRepoName(url: string): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(url);
    if (match) {
      return match[3];
    }
  }

  return null;
}

export function detectRepoName(): string {
  let remoteUrl: string;
  try {
    remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
  } catch {
    throw new Error('Not in a git repository. Check that git remote "origin" exists and try again.');
  }

  const repo = parseRepoName(remoteUrl);
  if (!repo) {
    throw new Error('Git remote "origin" is not an Azure DevOps URL. Check that origin points to Azure DevOps and try again.');
  }

  return repo;
}

export function getCurrentBranch(): string {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  if (branch === 'HEAD') {
    throw new Error('Not on a named branch. Check out a named branch and try again.');
  }

  return branch;
}
