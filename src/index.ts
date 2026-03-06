import { Command } from "commander";
import { version } from "./version.js";
import { createGetItemCommand } from "./commands/get-item.js";
import { createClearPatCommand } from "./commands/clear-pat.js";
import { createConfigCommand } from "./commands/config.js";
import { createSetStateCommand } from "./commands/set-state.js";
import { createAssignCommand } from "./commands/assign.js";
import { createSetFieldCommand } from "./commands/set-field.js";

const program = new Command();

program.name("azdo").description("Azure DevOps CLI tool").version(version, "-v, --version");

program.addCommand(createGetItemCommand());
program.addCommand(createClearPatCommand());
program.addCommand(createConfigCommand());
program.addCommand(createSetStateCommand());
program.addCommand(createAssignCommand());
program.addCommand(createSetFieldCommand());

program.showHelpAfterError();

program.parse();

if (process.argv.length <= 2) {
  program.help();
}
