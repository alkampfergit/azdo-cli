// One-time, process-scoped warning emitted the first time the CLI encounters an
// HTTPS remote that carries an embedded credential (a `<user>:<token>@` userinfo
// prefix on an HTTPS URL). Bare `<user>@` prefixes are not credentials and do
// NOT trigger this warning. See FR-004 / FR-004a / FR-004b and contract C-4.
//
// The warning string templates the remote name but NEVER the URL itself,
// so no part of the user or token segment can ever leak into stderr.

let warned = false;

function buildWarning(remoteName: string): string {
  return `azdo: warning: ${remoteName} includes embedded credentials; consider removing them with 'git remote set-url ${remoteName} <clean-url>'\n`;
}

// Emit the credential warning to stderr at most once per CLI process.
// Subsequent calls are no-ops. Never throws and never changes the exit code.
// remoteName defaults to 'origin' for callers that don't know the remote name.
export function noticeCredentialBearingRemote(remoteName = 'origin'): void {
  if (warned) {
    return;
  }
  warned = true;
  try {
    process.stderr.write(buildWarning(remoteName));
  } catch {
    // intentionally ignored — a failed warning must not break the CLI
  }
}

// Test-only: reset the module-scope `warned` flag between unit tests.
// DO NOT call this from production code.
export function __resetForTests(): void {
  warned = false;
}
