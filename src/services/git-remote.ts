import { execSync } from 'node:child_process';
import type { AzdoContext } from '../types/work-item.js';
import { noticeCredentialBearingRemote } from './remote-warning.js';

// Each HTTPS pattern tolerates an OPTIONAL `(?:[^@/]+@)?` userinfo prefix
// (`<user>@` or `<user>:<token>@`) between the scheme and the host, and an
// OPTIONAL `(?:\.git)?` suffix. The repository group is non-greedy
// (`([^/]+?)`) so the optional `.git` is absorbed by the suffix rather than
// captured as part of the repo name. The host literals are unchanged, so the
// recognised host set is NOT widened (FR-003): `dev.azure.com.evil.example`
// still fails because the literal `/` must immediately follow the host.
// The SSH patterns already require userinfo by syntax; they only gain the
// optional `.git` suffix.
const patterns: RegExp[] = [
  // HTTPS (current): https://[user[:token]@]dev.azure.com/{org}/{project}/_git/{repo}[.git]
  /^https?:\/\/(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+?)(?:\.git)?$/,
  // HTTPS (legacy + DefaultCollection): https://[user[:token]@]{org}.visualstudio.com/DefaultCollection/{project}/_git/{repo}[.git]
  /^https?:\/\/(?:[^@/]+@)?([^.]+)\.visualstudio\.com\/DefaultCollection\/([^/]+)\/_git\/([^/]+?)(?:\.git)?$/,
  // HTTPS (legacy): https://[user[:token]@]{org}.visualstudio.com/{project}/_git/{repo}[.git]
  /^https?:\/\/(?:[^@/]+@)?([^.]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/]+?)(?:\.git)?$/,
  // SSH (current): git@ssh.dev.azure.com:v3/{org}/{project}/{repo}[.git]
  /^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/,
  // SSH (legacy): {org}@vs-ssh.visualstudio.com:v3/{org}/{project}/{repo}[.git]
  /^[^@]+@vs-ssh\.visualstudio\.com:v3\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/,
];

// True when an HTTPS URL carries a userinfo prefix (`<user>@` /
// `<user>:<token>@`). SSH `user@host:` syntax is structural, not an embedded
// credential, so it deliberately does not match here.
const httpsUserinfo = /^https?:\/\/[^@/]+@/;

export function parseAzdoRemote(url: string): AzdoContext | null {
  for (const pattern of patterns) {
    const match = pattern.exec(url);
    if (match) {
      if (httpsUserinfo.test(url)) {
        noticeCredentialBearingRemote();
      }
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
      if (httpsUserinfo.test(url)) {
        noticeCredentialBearingRemote();
      }
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
