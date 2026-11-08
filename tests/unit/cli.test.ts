import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

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

  describe("--get-skill", () => {
    const skillFile = (path: string): string =>
      readFileSync(resolve(import.meta.dirname, "../../skills/azdo", path), "utf-8");

    it.each([[["--help", "--get-skill"]], [["--get-skill", "--help"]], [["--get-skill"]]])(
      "%j prints SKILL.md and nothing else",
      (args) => {
        const { stdout, stderr, exitCode } = run(args);
        expect(stdout).toBe(skillFile("SKILL.md"));
        expect(stderr).toBe("");
        expect(exitCode).toBe(0);
      },
    );

    it("--all prints every file as one document without the front matter", () => {
      const { stdout, exitCode } = run(["--get-skill", "--all"]);
      expect(exitCode).toBe(0);
      expect(stdout.startsWith("---")).toBe(false);
      expect(stdout).toContain("# azdo — Azure DevOps from the command line");
      expect(stdout).toContain("<!-- azdo skill: references/pull-requests.md -->");
      expect(stdout).toContain(skillFile("references/pipelines.md"));
    });

    it("--out writes the skill folder and lists the files written", () => {
      const dir = mkdtempSync(resolve(tmpdir(), "azdo-skill-"));
      try {
        const { stdout, exitCode } = run(["--get-skill", "--out", dir]);
        expect(exitCode).toBe(0);
        expect(stdout.trim().split("\n")).toHaveLength(6);
        expect(readFileSync(resolve(dir, "SKILL.md"), "utf-8")).toBe(skillFile("SKILL.md"));
        expect(readFileSync(resolve(dir, "references/work-items.md"), "utf-8")).toBe(
          skillFile("references/work-items.md"),
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("--out with --all is rejected", () => {
      const { stdout, stderr, exitCode } = run(["--get-skill", "--out", tmpdir(), "--all"]);
      expect(stdout).toBe("");
      expect(stderr).toContain("--out and --all cannot be used together");
      expect(exitCode).toBe(1);
    });

    it("--help lists --get-skill", () => {
      expect(run(["--help"]).stdout).toContain("--get-skill");
    });
  });
});
