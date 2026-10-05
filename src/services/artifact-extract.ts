import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
  for (const [entry, data] of Object.entries(entries)) {
    const relative = entryTarget(entry, options.artifactName);
    if (relative !== null) targets.push({ relative, data });
  }
  if (!options.force) {
    const existing = targets.find((t) => existsSync(path.join(destination, t.relative)));
    if (existing) {
      throw new Error(
        `"${path.join(destination, existing.relative)}" already exists. Use --force to overwrite.`,
      );
    }
  }
  for (const { relative, data } of targets) {
    const file = path.join(destination, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, data);
  }
  return targets.map((t) => t.relative);
}
