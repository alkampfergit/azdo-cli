import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
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

// True only when the HTTPS userinfo contains BOTH a username AND a password/token
// (`<user>:<token>@`). A bare `<user>@` prefix is not a credential — it only
// identifies the account and never contains a secret.
const httpsEmbeddedSecret = /^https?:\/\/[^:@/]+:[^@/]+@/;

export interface RemoteCandidate {
  remoteName: string;
  org: string;
  project: string;
  hasEmbeddedSecret: boolean;
}

/**
 * Parse the raw stdout of `git remote -v` (tab-delimited, may include fetch
 * and push lines) and return one `RemoteCandidate` per distinct AZDO remote.
 */
export function parseAllAzdoRemotes(output: string): RemoteCandidate[] {
  const seen = new Set<string>();
  const results: RemoteCandidate[] = [];

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Format: "<name>\t<url> (fetch|push)"
    const tabIdx = trimmed.indexOf('\t');
    if (tabIdx === -1) continue;

    const remoteName = trimmed.slice(0, tabIdx);
    if (seen.has(remoteName)) continue;

    // Strip the trailing " (fetch)" / " (push)" annotation
    const afterTab = trimmed.slice(tabIdx + 1);
    const urlEnd = afterTab.lastIndexOf(' (');
    const url = urlEnd !== -1 ? afterTab.slice(0, urlEnd) : afterTab;

    for (const pattern of patterns) {
      const match = pattern.exec(url);
      if (match) {
        const project = match[2];
        if (/^DefaultCollection$/i.test(project)) break;
        seen.add(remoteName);
        results.push({
          remoteName,
          org: match[1],
          project,
          hasEmbeddedSecret: httpsEmbeddedSecret.test(url),
        });
        break;
      }
    }
  }

  return results;
}

/**
 * Choose a single `RemoteCandidate` from the list following four-case logic:
 * 1. Empty list → throw (no AZDO remote found)
 * 2. Contains `origin` → return `origin`
 * 3. Single candidate → return it
 * 4. Multiple candidates with same org/project → return first; otherwise throw ambiguity error
 */
export function selectRemote(candidates: RemoteCandidate[]): RemoteCandidate {
  if (candidates.length === 0) {
    throw new Error('No Azure DevOps remote found. Provide --org and --project explicitly.');
  }

  const origin = candidates.find((c) => c.remoteName === 'origin');
  if (origin) return origin;

  if (candidates.length === 1) return candidates[0];

  const first = candidates[0];
  const allSame = candidates.every((c) => c.org === first.org && c.project === first.project);
  if (allSame) return first;

  const names = candidates.map((c) => c.remoteName).join(', ');
  throw new Error(
    `Ambiguous Azure DevOps remotes (${names}). Provide --org and --project explicitly.`,
  );
}

export function parseAzdoRemote(url: string): AzdoContext | null {
  for (const pattern of patterns) {
    const match = pattern.exec(url);
    if (match) {
      if (httpsEmbeddedSecret.test(url)) {
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

/**
 * Locate the `.git/config` file for the current working directory by walking
 * up the directory tree. Returns the config file contents, or throws if the
 * cwd is not inside a git repository.
 */
function readGitConfigContent(): string {
  const gitDirEnv = process.env.GIT_DIR;
  if (gitDirEnv) {
    return fs.readFileSync(path.join(gitDirEnv, 'config'), 'utf-8');
  }

  let dir = process.cwd();
  for (;;) {
    const gitPath = path.join(dir, '.git');
    try {
      const stat = fs.statSync(gitPath);
      if (stat.isDirectory()) {
        return fs.readFileSync(path.join(gitPath, 'config'), 'utf-8');
      }
      if (stat.isFile()) {
        // Worktree / submodule: `.git` is a file with "gitdir: <path>"
        const ref = fs.readFileSync(gitPath, 'utf-8');
        const m = /^gitdir:[ \t]*([^\r\n]+)/m.exec(ref);
        if (m) {
          return fs.readFileSync(path.join(path.resolve(dir, m[1].trim()), 'config'), 'utf-8');
        }
      }
    } catch { /* .git not present here — keep walking */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error('Not in a git repository. Provide --org and --project explicitly.');
}

/**
 * Parse `[remote "name"]` sections from a git config file content and return
 * a `git remote -v`-compatible text block (one "<name>\t<url> (fetch)" line
 * per remote) for use by `parseAllAzdoRemotes`.
 *
 * Exported for unit testing.
 */
export function gitConfigToRemoteLines(configContent: string): string {
  const lines: string[] = [];
  let currentRemote: string | null = null;
  let emittedUrl = false;

  for (const line of configContent.split('\n')) {
    const sectionMatch = /^\[remote\s+"([^"]+)"\]/.exec(line);
    if (sectionMatch) {
      currentRemote = sectionMatch[1];
      emittedUrl = false;
      continue;
    }
    if (/^\[/.test(line)) {
      currentRemote = null;
      emittedUrl = false;
      continue;
    }
    if (currentRemote && !emittedUrl) {
      const urlMatch = /^[ \t]+url[ \t]*=[ \t]*([^\r\n]+)/.exec(line);
      if (urlMatch) {
        lines.push(`${currentRemote}\t${urlMatch[1].trim()} (fetch)`);
        emittedUrl = true;
      }
    }
  }

  return lines.join('\n');
}

export function detectAzdoContext(): AzdoContext {
  let configContent: string;
  try {
    configContent = readGitConfigContent();
  } catch {
    throw new Error('Not in a git repository. Provide --org and --project explicitly.');
  }

  const remoteLines = gitConfigToRemoteLines(configContent);
  const candidates = parseAllAzdoRemotes(remoteLines);
  const selected = selectRemote(candidates);
  if (selected.hasEmbeddedSecret) {
    noticeCredentialBearingRemote(selected.remoteName);
  }
  return { org: selected.org, project: selected.project };
}

export function parseRepoName(url: string): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(url);
    if (match) {
      if (httpsEmbeddedSecret.test(url)) {
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
