import { Command } from "commander";
import { concatenateSkill, SKILL_FILES, writeSkill } from "../services/agent-skill.js";

export const GET_SKILL_FLAG = "--get-skill";

interface GetSkillOptions {
  out?: string;
  all?: boolean;
}

/**
 * Handles `azdo --get-skill` (and `azdo --help --get-skill`) before the real
 * command tree is parsed: commander answers `--help` before any option action
 * runs, and `--out` / `--all` must not become root options, where they would
 * swallow the subcommands' own `--all`. Returns false when the flag is absent.
 */
export function runGetSkill(args: readonly string[]): boolean {
  if (!args.includes(GET_SKILL_FLAG)) {
    return false;
  }
  const parser = new Command("azdo")
    .helpOption(false)
    .option(GET_SKILL_FLAG)
    .option("--out <dir>", "write the skill folder into <dir>")
    .option("--all", "print every skill file as one document")
    .allowUnknownOption()
    .allowExcessArguments();
  parser.parse([...args], { from: "user" });
  const { out, all } = parser.opts<GetSkillOptions>();

  if (out !== undefined && all) {
    process.stderr.write("Error: --out and --all cannot be used together.\n");
    process.exitCode = 1;
  } else if (out === undefined) {
    process.stdout.write(all ? concatenateSkill() : SKILL_FILES[0].content);
  } else {
    writeSkillFolder(out);
  }
  return true;
}

function writeSkillFolder(dir: string): void {
  try {
    for (const path of writeSkill(dir)) {
      process.stdout.write(`${path}\n`);
    }
  } catch (err) {
    process.stderr.write(`Error: cannot write the skill to ${dir}: ${(err as Error).message}\n`);
    process.exitCode = 1;
  }
}
