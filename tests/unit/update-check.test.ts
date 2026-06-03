import { describe, it, expect, vi } from "vitest";
import {
  getUpdateNotice,
  isNewer,
  parseCache,
  THROTTLE_MS,
  type UpdateCheckDeps,
} from "../../src/services/update-check.js";

/**
 * Build a fully-stubbed deps object so no test touches the real clock, fs,
 * network, or TTY. Individual tests override only what they care about.
 */
function deps(overrides: Partial<{ enabled: boolean } & UpdateCheckDeps> = {}) {
  const writeCache = vi.fn();
  const fetchLatest = vi.fn(async () => "0.6.0");
  const base = {
    enabled: true,
    now: () => 10_000_000,
    readCache: () => null as string | null,
    writeCache,
    fetchLatest,
    isTTY: () => true,
    currentVersion: "0.5.0",
  };
  return { opts: { ...base, ...overrides }, writeCache, fetchLatest };
}

describe("isNewer", () => {
  it("returns true when latest is strictly newer (patch/minor/major)", () => {
    expect(isNewer("0.5.1", "0.5.0")).toBe(true);
    expect(isNewer("0.6.0", "0.5.9")).toBe(true);
    expect(isNewer("1.0.0", "0.9.9")).toBe(true);
  });

  it("returns false when versions are equal", () => {
    expect(isNewer("0.5.0", "0.5.0")).toBe(false);
  });

  it("returns false when latest is older", () => {
    expect(isNewer("0.5.0", "0.6.0")).toBe(false);
    expect(isNewer("0.4.9", "0.5.0")).toBe(false);
  });

  it("ranks a pre-release below the matching release", () => {
    expect(isNewer("1.2.3-beta.1", "1.2.3")).toBe(false);
    expect(isNewer("1.2.3", "1.2.3-beta.1")).toBe(true);
  });

  it("tolerates a leading v and build metadata", () => {
    expect(isNewer("v0.6.0", "0.5.0")).toBe(true);
    expect(isNewer("0.6.0+build.7", "0.5.0")).toBe(true);
  });

  it("returns false on unparseable input", () => {
    expect(isNewer("not-a-version", "0.5.0")).toBe(false);
    expect(isNewer("0.6.0", "garbage")).toBe(false);
    expect(isNewer("", "")).toBe(false);
  });
});

describe("parseCache", () => {
  it("returns null for missing/empty/non-JSON input", () => {
    expect(parseCache(null)).toBeNull();
    expect(parseCache("")).toBeNull();
    expect(parseCache("{not json")).toBeNull();
  });

  it("returns null for wrong-shape input", () => {
    expect(parseCache(JSON.stringify({ lastCheck: "nope", latestVersion: "1.0.0" }))).toBeNull();
    expect(parseCache(JSON.stringify({ lastCheck: 1, latestVersion: "" }))).toBeNull();
    expect(parseCache(JSON.stringify({ lastCheck: Infinity, latestVersion: "1.0.0" }))).toBeNull();
    expect(parseCache(JSON.stringify([1, 2, 3]))).toBeNull();
  });

  it("parses a valid cache entry", () => {
    const raw = JSON.stringify({ lastCheck: 123, latestVersion: "0.6.0" });
    expect(parseCache(raw)).toEqual({ lastCheck: 123, latestVersion: "0.6.0" });
  });
});

describe("getUpdateNotice — User Story 1 (notice when newer stable exists)", () => {
  it("returns the one-line notice when a fresh check finds a newer version (C4)", async () => {
    const { opts, writeCache } = deps();
    const notice = await getUpdateNotice(opts);
    expect(notice).toContain("0.5.0 → 0.6.0");
    expect(notice).toContain("npm i -g azdo-cli");
    expect(writeCache).toHaveBeenCalledOnce();
  });

  it("returns null when the registry version equals the current version (C5)", async () => {
    const { opts, writeCache } = deps({ fetchLatest: vi.fn(async () => "0.5.0") });
    expect(await getUpdateNotice(opts)).toBeNull();
    // cache is still written on a successful (if uninteresting) check
    expect(writeCache).toHaveBeenCalledOnce();
  });

  it("returns null when the registry version is older than current (C8)", async () => {
    const { opts } = deps({ fetchLatest: vi.fn(async () => "0.4.0") });
    expect(await getUpdateNotice(opts)).toBeNull();
  });

  it("returns null for an unparseable current version (dev/local build) (C8)", async () => {
    const { opts } = deps({ currentVersion: "0.0.0-dev" + "?" });
    expect(await getUpdateNotice(opts)).toBeNull();
  });
});

describe("getUpdateNotice — User Story 2 (throttle + failure safety)", () => {
  it("does not fetch when lastCheck is within the throttle window (C3)", async () => {
    const now = 10_000_000;
    const { opts, fetchLatest } = deps({
      now: () => now,
      readCache: () => JSON.stringify({ lastCheck: now - (THROTTLE_MS - 1), latestVersion: "0.6.0" }),
    });
    expect(await getUpdateNotice(opts)).toBeNull();
    expect(fetchLatest).not.toHaveBeenCalled();
  });

  it("does fetch when the throttle window has elapsed", async () => {
    const now = 10_000_000;
    const { opts, fetchLatest } = deps({
      now: () => now,
      readCache: () => JSON.stringify({ lastCheck: now - (THROTTLE_MS + 1), latestVersion: "0.5.0" }),
    });
    await getUpdateNotice(opts);
    expect(fetchLatest).toHaveBeenCalledOnce();
  });

  it("leaves the cache unchanged when fetchLatest returns null (C6)", async () => {
    const { opts, writeCache } = deps({ fetchLatest: vi.fn(async () => null) });
    expect(await getUpdateNotice(opts)).toBeNull();
    expect(writeCache).not.toHaveBeenCalled();
  });

  it("leaves the cache unchanged when fetchLatest throws (C6)", async () => {
    const { opts, writeCache } = deps({
      fetchLatest: vi.fn(async () => {
        throw new Error("network down");
      }),
    });
    expect(await getUpdateNotice(opts)).toBeNull();
    expect(writeCache).not.toHaveBeenCalled();
  });
});

describe("getUpdateNotice — User Story 3 (suppression + tolerance)", () => {
  it("short-circuits when disabled: no cache read, no fetch (C1)", async () => {
    const readCache = vi.fn(() => null);
    const { opts, fetchLatest } = deps({ enabled: false, readCache });
    expect(await getUpdateNotice(opts)).toBeNull();
    expect(readCache).not.toHaveBeenCalled();
    expect(fetchLatest).not.toHaveBeenCalled();
  });

  it("short-circuits in non-interactive output: no fetch (C2)", async () => {
    const { opts, fetchLatest } = deps({ isTTY: () => false });
    expect(await getUpdateNotice(opts)).toBeNull();
    expect(fetchLatest).not.toHaveBeenCalled();
  });

  it("treats a corrupt cache as lastCheck=0, proceeds to fetch, never throws (C7)", async () => {
    const { opts, fetchLatest } = deps({ readCache: () => "{garbage" });
    const notice = await getUpdateNotice(opts);
    expect(fetchLatest).toHaveBeenCalledOnce();
    expect(notice).toContain("0.5.0 → 0.6.0");
  });

  it("treats a missing cache as lastCheck=0, proceeds to fetch (C7)", async () => {
    const { opts, fetchLatest } = deps({ readCache: () => null });
    await getUpdateNotice(opts);
    expect(fetchLatest).toHaveBeenCalledOnce();
  });
});
