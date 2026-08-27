import { Command } from "commander";
import { version } from "./version.js";
import { createGetItemCommand } from "./commands/get-item.js";
import { createClearPatCommand } from "./commands/clear-pat.js";
import { createAuthCommand } from "./commands/auth.js";
import { createConfigCommand } from "./commands/config.js";
import { createSetStateCommand } from "./commands/set-state.js";
import { createAssignCommand } from "./commands/assign.js";
import { createSetFieldCommand } from "./commands/set-field.js";
import { createGetMdFieldCommand } from "./commands/get-md-field.js";
import { createSetMdFieldCommand } from "./commands/set-md-field.js";
import { createUpsertCommand } from "./commands/upsert.js";
import { createListFieldsCommand } from "./commands/list-fields.js";
import { createPrCommand } from "./commands/pr.js";
import { createPipelineCommand } from "./commands/pipeline.js";
import { createCommentsCommand } from "./commands/comments.js";
import { createDownloadAttachmentCommand } from "./commands/download-attachment.js";
import { createAddAttachmentCommand } from "./commands/add-attachment.js";
import { createRelationsCommand } from "./commands/relations.js";
import { getUpdateNotice } from "./services/update-check.js";
import { initTraceWriter } from "./services/trace-writer.js";

// Standard CLI behaviour for `azdo … | head`: when the downstream reader
// closes the pipe early, swallow EPIPE and exit cleanly instead of dumping
// an unhandled Socket error stack.
function exitOnEpipe(err: NodeJS.ErrnoException): void {
  if (err.code === "EPIPE") {
    process.exit(0);
  }
  throw err;
}
process.stdout.on("error", exitOnEpipe);
process.stderr.on("error", exitOnEpipe);

const program = new Command();

program.name("azdo").description("Azure DevOps CLI tool").version(version, "-v, --version");

program.option("--no-update-check", "Skip the check for a newer published version");
program.option("--trace <filepath>", "Append redacted HTTP request/response trace to a file (owner-read-only permissions)");

program.addCommand(createGetItemCommand());
program.addCommand(createAuthCommand());
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
program.addCommand(createPipelineCommand());
program.addCommand(createCommentsCommand());
program.addCommand(createDownloadAttachmentCommand());
program.addCommand(createAddAttachmentCommand());
program.addCommand(createRelationsCommand());

program.showHelpAfterError();

program.hook("preAction", () => {
  const { trace } = program.opts() as { trace?: string };
  if (trace) {
    initTraceWriter(trace);
  }
});

// After a command finishes, print a best-effort update notice on stderr.
// The hook only fires for action commands, so -v/--version and help paths
// are naturally skipped. Any failure is swallowed by getUpdateNotice itself.
program.hook("postAction", async () => {
  const notice = await getUpdateNotice({ enabled: program.opts().updateCheck });
  if (notice) {
    process.stderr.write(notice + "\n");
  }
});

await program.parseAsync();

if (process.argv.length <= 2) {
  program.help();
}
