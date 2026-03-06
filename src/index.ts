import { Command } from "commander";
import { version } from "./version.js";
import { createGetItemCommand } from "./commands/get-item.js";
import { createClearPatCommand } from "./commands/clear-pat.js";
import { createConfigCommand } from "./commands/config.js";

const program = new Command();

program.name("azdo").description("Azure DevOps CLI tool").version(version, "-v, --version");

program.addCommand(createGetItemCommand());
program.addCommand(createClearPatCommand());
program.addCommand(createConfigCommand());

program.showHelpAfterError();

program.parse();

if (process.argv.length <= 2) {
  program.help();
}
