import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const CLI_PATH = resolve(import.meta.dirname, "../../dist/index.js");

function run(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [CLI_PATH, ...args], {
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
    expect(stdout.trim()).toBe("0.2.0");
    expect(exitCode).toBe(0);
  });

  it("--help outputs usage information", () => {
    const { stdout, exitCode } = run(["--help"]);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("Azure DevOps CLI tool");
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
