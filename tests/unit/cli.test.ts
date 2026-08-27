import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const CLI_PATH = resolve(import.meta.dirname, "../../dist/index.js");
const { version: PKG_VERSION } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../package.json"), "utf-8")
);

function run(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync(process.execPath, [CLI_PATH, ...args], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout: string; stderr: string; status: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", exitCode: e.status ?? 1 };
  }
}

describe("azdo CLI", () => {
  it("--version outputs correct version", () => {
    const { stdout, exitCode } = run(["--version"]);
    expect(stdout.trim()).toBe(PKG_VERSION);
    expect(exitCode).toBe(0);
  });

  it("--help outputs usage information", () => {
    const { stdout, exitCode } = run(["--help"]);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("Azure DevOps CLI tool");
    expect(stdout).toContain("upsert");
    expect(exitCode).toBe(0);
  });

  it("--help lists add-attachment and delete-attachment alongside download-attachment", () => {
    const { stdout, exitCode } = run(["--help"]);
    expect(stdout).toContain("download-attachment");
    expect(stdout).toContain("add-attachment");
    expect(stdout).toContain("delete-attachment");
    expect(exitCode).toBe(0);
  });

  it("add-attachment --help describes its arguments and options", () => {
    const { stdout, exitCode } = run(["add-attachment", "--help"]);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("<id>");
    expect(stdout).toContain("<file>");
    expect(stdout).toContain("--comment");
    expect(stdout).toContain("--org");
    expect(stdout).toContain("--project");
    expect(exitCode).toBe(0);
  });

  it("delete-attachment --help describes its arguments and options", () => {
    const { stdout, exitCode } = run(["delete-attachment", "--help"]);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("<id>");
    expect(stdout).toContain("<filename>");
    expect(stdout).toContain("--id");
    expect(stdout).toContain("--yes");
    expect(stdout).toContain("--org");
    expect(stdout).toContain("--project");
    expect(exitCode).toBe(0);
  });

  it("no arguments displays help", () => {
    const result = run([]);
    const output = result.stdout + result.stderr;
    expect(output).toContain("Usage:");
    expect(output).toContain("Azure DevOps CLI tool");
  });

  it("--foo unknown option shows error and help", () => {
    const { stderr, exitCode } = run(["--foo"]);
    expect(stderr).toContain("unknown option");
    expect(stderr).toContain("Usage:");
    expect(exitCode).toBe(1);
  });
});
