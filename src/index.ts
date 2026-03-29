import { Command } from "commander";
import { version } from "./version.js";
import { createGetItemCommand } from "./commands/get-item.js";
import { createClearPatCommand } from "./commands/clear-pat.js";
import { createConfigCommand } from "./commands/config.js";
import { createSetStateCommand } from "./commands/set-state.js";
import { createAssignCommand } from "./commands/assign.js";
import { createSetFieldCommand } from "./commands/set-field.js";
import { createGetMdFieldCommand } from "./commands/get-md-field.js";
import { createSetMdFieldCommand } from "./commands/set-md-field.js";
import { createUpsertCommand } from "./commands/upsert.js";
import { createListFieldsCommand } from "./commands/list-fields.js";
import { createPrCommand } from "./commands/pr.js";
import { createCommentsCommand } from "./commands/comments.js";

const program = new Command();

program.name("azdo").description("Azure DevOps CLI tool").version(version, "-v, --version");

program.addCommand(createGetItemCommand());
program.addCommand(createClearPatCommand());
program.addCommand(createConfigCommand());
program.addCommand(createSetStateCommand());
program.addCommand(createAssignCommand());
program.addCommand(createSetFieldCommand());
program.addCommand(createGetMdFieldCommand());
program.addCommand(createSetMdFieldCommand());
program.addCommand(createUpsertCommand());
program.addCommand(createListFieldsCommand());
program.addCommand(createPrCommand());
program.addCommand(createCommentsCommand());

program.showHelpAfterError();

program.parse();

if (process.argv.length <= 2) {
  program.help();
}
