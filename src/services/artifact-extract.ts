import { existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';

export interface ExtractOptions {
  // Artifact name; Azure DevOps prefixes every zip entry with `<name>/`.
  artifactName: string;
  force: boolean;
}

// Maps a zip entry name to a path relative to the destination, or throws when
// it would escape it (zip-slip). Directory entries return null.
function entryTarget(entry: string, artifactName: string): string | null {
  const normalized = entry.replaceAll('\\', '/');
  if (normalized.endsWith('/')) return null;
  const prefix = `${artifactName}/`;
  const relative = normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
  const segments = relative.split('/');
  if (relative.startsWith('/') || /^[A-Za-z]:/.test(relative) || segments.includes('..')) {
    throw new Error(`Refusing to extract "${entry}": path escapes the destination folder.`);
  }
  return relative;
}

// Rejects a target whose existing path components include a symlink (even a
// dangling one): writing through it could land outside the destination.
function assertNoSymlinkEscape(root: string, relative: string): void {
  let current = root;
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    let isLink: boolean;
    try {
      isLink = lstatSync(current).isSymbolicLink();
    } catch {
      return; // component does not exist yet; nothing deeper can be a link
    }
    if (isLink) {
      throw new Error(`Refusing to extract through symbolic link "${current}".`);
    }
  }
}

// Extracts the zip held in memory straight into `destination`. No zip file is
// ever written, so there is nothing to clean up if extraction fails; all
// targets are validated (and checked for collisions) before the first write.
// Returns the relative paths written.
export function extractArtifactZip(
  zip: Uint8Array,
  destination: string,
  options: ExtractOptions,
): string[] {
  const entries = unzipSync(zip);
  const targets: { relative: string; data: Uint8Array }[] = [];
  const seen = new Set<string>();
  for (const [entry, data] of Object.entries(entries)) {
    const relative = entryTarget(entry, options.artifactName);
    if (relative === null) continue;
    const key = path.posix.normalize(relative);
    if (seen.has(key)) {
      throw new Error(`Refusing to extract: several archive entries resolve to "${key}".`);
    }
    seen.add(key);
    targets.push({ relative: key, data });
  }
  if (!options.force) {
    const existing = targets.find((t) => existsSync(path.join(destination, t.relative)));
    if (existing) {
      throw new Error(
        `"${path.join(destination, existing.relative)}" already exists. Use --force to overwrite.`,
      );
    }
  }
  mkdirSync(destination, { recursive: true });
  const root = realpathSync(destination);
  for (const { relative } of targets) assertNoSymlinkEscape(root, relative);
  for (const { relative, data } of targets) {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, data);
  }
  return targets.map((t) => t.relative);
}
