import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { version as runningVersion } from "../version.js";

/** 10-minute throttle window between successful registry checks. */
export const THROTTLE_MS = 10 * 60 * 1000;
/** Abort timeout for the registry request. */
export const FETCH_TIMEOUT_MS = 1500;
/** The `latest` dist-tag endpoint returns the stable manifest (excludes pre-releases). */
export const REGISTRY_URL = "https://registry.npmjs.org/azdo-cli/latest";

/**
 * Injectable dependencies. They exist purely so unit tests run with no real
 * I/O (clock, fs, fetch, TTY, version are all stubbable).
 */
export interface UpdateCheckDeps {
  now?: () => number;
  readCache?: () => string | null;
  writeCache?: (data: string) => void;
  fetchLatest?: () => Promise<string | null>;
  isTTY?: () => boolean;
  currentVersion?: string;
}

interface UpdateCheckCache {
  lastCheck: number;
  latestVersion: string;
}

/** Path to the local update-check cache, alongside the existing `~/.azdo/` state. */
export function getCachePath(): string {
  return path.join(os.homedir(), ".azdo", "update-check.json");
}

function defaultReadCache(): string | null {
  try {
    return fs.readFileSync(getCachePath(), "utf-8");
  } catch {
    return null;
  }
}

function defaultWriteCache(data: string): void {
  try {
    const cachePath = getCachePath();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, data);
  } catch {
    // Best-effort cache: a write failure must never surface to the user.
  }
}

/**
 * Parse the raw cache contents into a typed entry, or `null` when the input is
 * missing, non-JSON, or fails the shape guard (treated as "no recent check").
 */
export function parseCache(raw: string | null): UpdateCheckCache | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { lastCheck, latestVersion } = parsed as Record<string, unknown>;
  if (typeof lastCheck !== "number" || !Number.isFinite(lastCheck)) return null;
  if (typeof latestVersion !== "string" || latestVersion.length === 0) return null;
  return { lastCheck, latestVersion };
}

async function defaultFetchLatest(): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(REGISTRY_URL, { signal: controller.signal });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (typeof body !== "object" || body === null) return null;
    const v = (body as Record<string, unknown>).version;
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface ParsedVersion {
  release: [number, number, number];
  prerelease: boolean;
}

function parseVersion(v: string): ParsedVersion | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim().replace(/^v/, "");
  const match = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.exec(trimmed);
  if (!match) return null;
  const release: [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (!release.every(Number.isFinite)) return null;
  return { release, prerelease: match[4] !== undefined };
}

/**
 * Numeric semver comparison: is `latest` strictly newer than `current`?
 * Dotted major/minor/patch compare; a pre-release suffix ranks below the
 * matching release. Returns `false` on any unparseable input.
 */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a.release[i] > b.release[i]) return true;
    if (a.release[i] < b.release[i]) return false;
  }
  // Release numbers are equal: release > pre-release.
  if (a.prerelease && !b.prerelease) return false;
  if (!a.prerelease && b.prerelease) return true;
  return false;
}

/**
 * Best-effort update check. Resolves to a one-line notice string when a fresh,
 * successful check finds a newer stable version, otherwise `null`. NEVER throws,
 * NEVER blocks beyond the bounded fetch, NEVER writes to stdout/stderr itself.
 */
export async function getUpdateNotice(
  opts?: { enabled?: boolean } & UpdateCheckDeps,
): Promise<string | null> {
  try {
    const {
      enabled = true,
      now = Date.now,
      readCache = defaultReadCache,
      writeCache = defaultWriteCache,
      fetchLatest = defaultFetchLatest,
      isTTY = () => Boolean(process.stderr.isTTY),
      currentVersion = runningVersion,
    } = opts ?? {};

    // Suppression guards first — no cache read, no fetch (C1, C2).
    if (enabled === false) return null;
    if (!isTTY()) return null;

    // Throttle gate: corrupt/missing cache is treated as lastCheck = 0 (C3, C7).
    const cache = parseCache(readCache());
    const lastCheck = cache?.lastCheck ?? 0;
    if (now() - lastCheck < THROTTLE_MS) return null;

    // Fresh check. A failure (null / throw) leaves the cache untouched (C6).
    const latest = await fetchLatest();
    if (!latest) return null;

    // Success: advance the throttle window.
    writeCache(JSON.stringify({ lastCheck: now(), latestVersion: latest }));

    if (isNewer(latest, currentVersion)) {
      return `A new version of azdo-cli is available: ${currentVersion} → ${latest}. Run \`npm i -g azdo-cli\` to update.`;
    }
    return null;
  } catch {
    // Strictly best-effort: any unexpected error is swallowed.
    return null;
  }
}
