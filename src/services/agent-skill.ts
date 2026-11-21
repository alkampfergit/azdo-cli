import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import skill from "../../skills/azdo/SKILL.md";
import workItems from "../../skills/azdo/references/work-items.md";
import pullRequests from "../../skills/azdo/references/pull-requests.md";
import pipelines from "../../skills/azdo/references/pipelines.md";
import relations from "../../skills/azdo/references/relations.md";
import authAndConfig from "../../skills/azdo/references/auth-and-config.md";

export interface SkillFile {
  /** Path relative to the skill folder, always with `/` separators. */
  path: string;
  content: string;
}

/**
 * The agent skill shipped with the CLI (skills/azdo/), inlined at build time
 * so it always matches the installed version. SKILL.md comes first; the
 * references are in the order SKILL.md's index lists them.
 */
export const SKILL_FILES: readonly SkillFile[] = [
  { path: "SKILL.md", content: skill },
  { path: "references/work-items.md", content: workItems },
  { path: "references/pull-requests.md", content: pullRequests },
  { path: "references/pipelines.md", content: pipelines },
  { path: "references/relations.md", content: relations },
  { path: "references/auth-and-config.md", content: authAndConfig },
];

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)+/;

/**
 * Every skill file in one markdown document, for tools that read a single
 * instruction file (AGENTS.md, copilot-instructions.md). SKILL.md's front
 * matter is dropped, since it would sit in the middle of the host file.
 */
export function concatenateSkill(): string {
  return SKILL_FILES.map(({ path, content }, index) =>
    index === 0 ? content.replace(FRONT_MATTER, "") : `<!-- azdo skill: ${path} -->\n\n${content}`,
  ).join("\n");
}

/** Writes the skill folder under `dir` and returns the paths written. */
export function writeSkill(dir: string): string[] {
  return SKILL_FILES.map(({ path, content }) => {
    const target = join(dir, ...path.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
    return target;
  });
}
