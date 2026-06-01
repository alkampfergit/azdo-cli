# Contract — CLI surface

All user-visible strings the implementation must emit. Every value below is a **contract**: the corresponding Phase 2 test asserts the exact text (with the documented placeholders).

## C-1 — Help text for `--pr-number` (FR-005)

Every `azdo pr <sub> --help` rendering MUST include this exact sentence on the `--pr-number` line:

```
--pr-number <N>  target the pull request with this numeric id, instead of the
                 current branch's PR. When omitted, the CLI auto-detects the
                 pull request whose source branch equals refs/heads/<current
                 branch> in the Azure DevOps repository identified by the
                 origin remote; if zero or more than one open PR matches, the
                 command fails with a message naming the searched branch.
```

Subcommands carrying `--pr-number` today (must all match):
- `azdo pr status --help`
- `azdo pr comments --help`
- `azdo pr comment-resolve --help`
- `azdo pr comment-reopen --help`

**Test contract**: render `--help` for each subcommand above; assert the substring `pull request whose source branch equals refs/heads/<current branch>` appears in stdout.

## C-2 — Zero-match error (FR-006, first half)

When auto-detection yields no PRs:

- **Stream**: `process.stderr`
- **Format**: `No open pull request matches branch <branch>. Pass --pr-number to target a specific PR, or push the branch and open a pull request.\n`
- **Exit code**: `1`
- **Stdout**: empty
- `<branch>` is the value returned by `getCurrentBranch()` (e.g. `019-fix-pr-command`), verbatim.

## C-3 — Multi-match error (FR-006, second half)

When auto-detection yields ≥ 2 matching open PRs:

- **Stream**: `process.stderr`
- **Format**: `Multiple open pull requests match branch <branch>: <#a>, <#b>[, <#c>…]. Re-run with --pr-number to choose.\n`
- **Exit code**: `1`
- **Stdout**: empty
- The PR numbers are listed in the order Azure DevOps returns them; the CLI does not re-sort. Each is preceded by `#` and separated by `, ` (comma-space).
- No interactive prompt is ever shown — even when `process.stdout.isTTY === true`.

## C-4 — Credential-bearing remote warning (FR-004 + FR-004a)

When the URL parser successfully parses an Azure DevOps URL that contains a userinfo prefix:

- **Stream**: `process.stderr`
- **Format**: `azdo: warning: origin includes embedded credentials; consider removing them with 'git remote set-url origin <clean-url>'\n`
- **Exit code**: unaffected (does not change the command's exit code in any way).
- **Stdout**: unaffected.
- **Emission count**: exactly one per CLI process, regardless of how many times the parser is called with credential-bearing URLs.
- **Sanitisation**: the literal text above is constant; the warning string MUST NOT be templated against the URL.

**Test contract**:
- Parse a credential-bearing URL twice in the same process; assert exactly one warning line on stderr.
- Parse a `user:token@` URL once; assert the emitted line contains neither the user segment nor the token segment.
- Parse a non-userinfo URL; assert zero warning lines on stderr.

## C-5 — Recognised URL forms (FR-001 + FR-002)

The parser MUST accept the following URL forms, with and without an optional `<user>@` or `<user>:<token>@` userinfo prefix, and with and without a trailing `.git` suffix:

| # | Form |
|---|------|
| 1 | `https://dev.azure.com/<org>/<project>/_git/<repo>` |
| 2 | `https://<org>.visualstudio.com/DefaultCollection/<project>/_git/<repo>` |
| 3 | `https://<org>.visualstudio.com/<project>/_git/<repo>` |
| 4 | `git@ssh.dev.azure.com:v3/<org>/<project>/<repo>` |
| 5 | `<user>@vs-ssh.visualstudio.com:v3/<org>/<project>/<repo>` |

Forms 4 and 5 already accept arbitrary userinfo (the SSH `user@host:` syntax is mandatory).

**Test contract**: 4 (HTTPS forms) × 2 (with/without userinfo) × 2 (with/without `.git`) = 16 positive cases. Plus the existing positive cases without userinfo (regression).

## C-6 — Recognised URL forms — negatives (FR-003)

The parser MUST reject:

| # | URL | Reason |
|---|-----|--------|
| N1 | `https://github.com/owner/repo.git` | unrelated host |
| N2 | `https://user@github.com/owner/repo.git` | unrelated host, userinfo MUST NOT mask the host check |
| N3 | `https://user@dev.azure.com.evil.example/o/p/_git/r` | suffix on host string MUST NOT match |
| N4 | `https://dev.azure.com.evil.example/o/p/_git/r` | same, no userinfo |
| N5 | `ftp://dev.azure.com/o/p/_git/r` | scheme is not `https?:` |

## C-7 — Behavioural parity for non-userinfo URLs (FR-007)

For every existing non-userinfo URL that the parser accepts today, the parsed `(org, project)` (and `repo` from `parseRepoName`) MUST be byte-identical after the fix. This is the regression contract.

**Test contract**: a parametrised test feeds each of the 5 forms (form 1 / 2 / 3 / 4 / 5) without userinfo and without `.git` and asserts `parseAzdoRemote(url)` and `parseRepoName(url)` return the same values as the current implementation. The current values are captured in a `tests/unit/fixtures/git-remote.cases.ts` (or equivalent) at the start of the patch and treated as a frozen snapshot.
