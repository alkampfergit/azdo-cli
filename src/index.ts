import { createProgram } from "./program.js";

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

const program = createProgram();

await program.parseAsync();

if (process.argv.length <= 2) {
  program.help();
}
