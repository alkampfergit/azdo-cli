import { execSync } from 'node:child_process';
import type { AzdoContext } from '../types/work-item.js';

const patterns: RegExp[] = [
  // HTTPS (current): https://dev.azure.com/{org}/{project}/_git/{repo}
  /^https?:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/.+$/,
  // HTTPS (legacy + DefaultCollection): https://{org}.visualstudio.com/DefaultCollection/{project}/_git/{repo}
  /^https?:\/\/([^.]+)\.visualstudio\.com\/DefaultCollection\/([^/]+)\/_git\/.+$/,
  // HTTPS (legacy): https://{org}.visualstudio.com/{project}/_git/{repo}
  /^https?:\/\/([^.]+)\.visualstudio\.com\/([^/]+)\/_git\/.+$/,
  // SSH (current): git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
  /^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/.+$/,
  // SSH (legacy): {org}@vs-ssh.visualstudio.com:v3/{org}/{project}/{repo}
  /^[^@]+@vs-ssh\.visualstudio\.com:v3\/([^/]+)\/([^/]+)\/.+$/,
];

export function parseAzdoRemote(url: string): AzdoContext | null {
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return { org: match[1], project: match[2] };
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
  if (!context) {
    throw new Error('Git remote "origin" is not an Azure DevOps URL. Provide --org and --project explicitly.');
  }

  return context;
}
