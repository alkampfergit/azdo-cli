// One-time, process-scoped warning emitted the first time the CLI parses an
// `origin` remote that carries an embedded credential (a `<user>@` or
// `<user>:<token>@` userinfo prefix on an HTTPS URL). See FR-004 / FR-004a
// and contract C-4.
//
// The warning string is a CONSTANT — it is never templated against the URL,
// so no part of the user or token segment can ever leak into stderr.

const WARNING =
  "azdo: warning: origin includes embedded credentials; consider removing them with 'git remote set-url origin <clean-url>'\n";

let warned = false;

// Emit the credential warning to stderr at most once per CLI process.
// Subsequent calls are no-ops. Never throws and never changes the exit code.
export function noticeCredentialBearingRemote(): void {
  if (warned) {
    return;
  }
  warned = true;
  // Best-effort: process.stderr.write can throw if the stream is closed/errored.
  // The warning must never affect command execution or the exit code (FR-004a),
  // so swallow any failure.
  try {
    process.stderr.write(WARNING);
  } catch {
    // intentionally ignored — a failed warning must not break the CLI
  }
}

// Test-only: reset the module-scope `warned` flag between unit tests.
// DO NOT call this from production code.
export function __resetForTests(): void {
  warned = false;
}
