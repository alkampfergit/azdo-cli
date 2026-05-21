# Feature Specification: Fix `azdo pr` errors on valid Azure DevOps remotes

**Feature Branch**: `019-fix-pr-command`
**Created**: 2026-05-21
**Status**: Draft
**Input**: User description: "Issue #40 — `azdo pr status` aborts with *Git remote \"origin\" is not an Azure DevOps URL* even though the configured remote is a valid Azure DevOps HTTPS URL of the form `https://<user>@dev.azure.com/<org>/<project>/_git/<repo>`. Also clarify and document how the active pull request is selected when `--pr-number` is not supplied."

## Clarifications

### Session 2026-05-21

- Q: When the current branch matches more than one open PR, what should the CLI do? → A: List the matching PR numbers on stderr and exit non-zero (option A — non-interactive, no TTY prompt, no auto-pick).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — `azdo pr` recognises a valid Azure DevOps remote that includes a user component in the URL (Priority: P1)

A developer has cloned an Azure DevOps repository whose `origin` remote was set with a userinfo prefix (e.g. `https://prxm@dev.azure.com/prxm/Jarvis/_git/jarvis-claude-plugin`) — this is the URL form that the Azure DevOps web UI offers when *Generate Git Credentials* is enabled and that standard Git tooling preserves on `git clone`. From inside that working tree, running `azdo pr status` should resolve the organisation, project and repository from the remote and show the active pull request information, **without** the developer having to pass `--org`, `--project` or `--repo` and **without** having to rewrite their `origin` URL.

**Why this priority**: This is the reported bug. Today the command exits 1 with a misleading error ("not an Azure DevOps URL") even though the URL clearly is one. It blocks the entire `azdo pr` command family for any user who cloned with their Microsoft account or PAT username embedded in the URL — which is the default in Azure DevOps's own "Clone in Git" instructions. Until this is fixed, every `azdo pr` subcommand is unreliable in real-world setups.

**Independent Test**: In a freshly cloned repo where `git remote get-url origin` returns a URL of the shape `https://<anything>@dev.azure.com/<org>/<project>/_git/<repo>` (HTTPS) or the equivalent legacy `<user>@<org>.visualstudio.com` form, run `azdo pr status`. With this fix shipped, the command produces the same output it produces today on a remote URL **without** the `<user>@` prefix; without the fix, it exits 1 with the URL-recognition error. The fix is verifiable with the existing parser unit tests plus a new case for the userinfo form.

**Acceptance Scenarios**:

1. **Given** a working directory whose `origin` is `https://prxm@dev.azure.com/prxm/Jarvis/_git/jarvis-claude-plugin`, **When** the user runs `azdo pr status` (no flags), **Then** the command resolves `org=prxm`, `project=Jarvis`, `repo=jarvis-claude-plugin` and proceeds to query pull requests for the current branch, just as it would for the same URL written without the leading `prxm@`.
2. **Given** a working directory whose `origin` is `https://someone@org.visualstudio.com/MyProject/_git/MyRepo` (legacy host, with userinfo), **When** the user runs any `azdo pr` subcommand that auto-detects context, **Then** the command resolves `org=org`, `project=MyProject`, `repo=MyRepo` without error.
3. **Given** a working directory whose `origin` is a non-Azure-DevOps URL (e.g. `https://github.com/owner/repo.git`), **When** the user runs `azdo pr status`, **Then** the command still aborts with the existing "not an Azure DevOps URL" error — the fix MUST NOT loosen recognition into accepting unrelated hosts.
4. **Given** the same `origin` URLs as scenarios 1–2 but with a trailing `.git` suffix (a form Git also accepts on clone), **When** the user runs `azdo pr status`, **Then** the command resolves context successfully and behaves identically to the same URL without the suffix.

---

### User Story 2 — Users can find out how the active pull request is chosen when `--pr-number` is not supplied (Priority: P2)

When the user runs an `azdo pr` subcommand (e.g. `status`, `comments`, `comment-resolve`) **without** `--pr-number`, the CLI selects a pull request automatically. Today the rule is not documented anywhere the user can see (only in the code). The user wants to know — from `--help` text and, when selection fails, from the error message — exactly what criteria the CLI uses, so they can predict what `azdo pr status` will do before running it and so the error message tells them what to fix.

**Why this priority**: The user explicitly asked. It is not a defect that blocks command execution, but it is a documentation/UX gap that makes the auto-detection feel like a black box. Closing this gap is small relative to User Story 1 and can ship in the same change.

**Independent Test**: Run `azdo pr status --help` (and every other `azdo pr <sub>` `--help` that accepts `--pr-number`). The help text describes the auto-detection rule in plain language — what the CLI looks at (current branch, current remote) and what condition determines a match. Additionally, when the auto-detection finds zero or more than one candidate, the error message names the rule it applied and the value(s) it looked for, so the user can reproduce the lookup manually.

**Acceptance Scenarios**:

1. **Given** any `azdo pr <sub>` command that accepts `--pr-number`, **When** the user runs `azdo pr <sub> --help`, **Then** the help output contains a short, plain-language description of how the active PR is chosen when `--pr-number` is omitted, including the inputs (current branch, current `origin` URL) and the match criterion.
2. **Given** the current branch has no matching open pull request in Azure DevOps, **When** the user runs `azdo pr status`, **Then** the error message names the branch it searched for AND the auto-detection rule, so the user can either supply `--pr-number` or push the branch and open a PR.
3. **Given** the current branch matches more than one open pull request, **When** the user runs `azdo pr status`, **Then** the CLI writes a single line to stderr naming the searched branch and listing the matching PR numbers (e.g. `Multiple PRs match branch <name>: #12, #34. Re-run with --pr-number to choose.`) and exits with a non-zero status. No interactive prompt is shown under any condition; no PR is auto-picked.

---

### Edge Cases

- `origin` URL contains userinfo with credentials embedded as `https://user:token@dev.azure.com/...` (Git supports this form). The fix MUST accept it for parsing purposes; it MUST NOT log, echo or persist the embedded token anywhere, including error messages and verbose output.
- `origin` URL uses an upper-case scheme or host casing (`HTTPS://Dev.Azure.com/...`). Today's parser is case-sensitive on the host; the fix MUST not regress this behaviour but does not need to broaden it (Git canonicalises to lowercase on clone).
- `origin` URL ends in `.git` (`https://prxm@dev.azure.com/prxm/Jarvis/_git/jarvis-claude-plugin.git`). The current parser rejects this; the fix MUST accept it.
- Multiple remotes exist (`origin` plus a fork). The CLI continues to read only `origin`; no behavioural change in this release.
- Repo is in detached HEAD. Today `getCurrentBranch()` errors with "Not on a named branch"; this is unchanged by the fix and the documented auto-detection rule MUST mention that a named branch is required.
- User passes both `--pr-number` and is on a branch with a matching PR. `--pr-number` wins (existing behaviour); the documentation MUST state this precedence.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The CLI MUST recognise an Azure DevOps remote URL whose authority component contains userinfo (`<user>@` or `<user>:<token>@`) before the host, for every URL form the CLI already accepts without userinfo (current HTTPS `dev.azure.com/<org>/<project>/_git/<repo>`, legacy `visualstudio.com` with or without `DefaultCollection`).
- **FR-002**: The CLI MUST recognise the same Azure DevOps remote URL forms with a trailing `.git` suffix.
- **FR-003**: The CLI MUST NOT broaden recognition to hosts other than the Azure DevOps hosts it already accepts. A URL whose host is not `dev.azure.com`, `<org>.visualstudio.com`, `ssh.dev.azure.com`, or `vs-ssh.visualstudio.com` MUST continue to be rejected.
- **FR-004**: Any error message, log line, or verbose output produced by the URL parser or its callers MUST NOT contain the embedded password/token portion of a `user:token@` userinfo component. The presence of userinfo MUST NOT be reflected in user-visible output beyond what is strictly necessary to identify the URL form.
- **FR-005**: The `--help` text for every `azdo pr <sub>` command that supports `--pr-number` MUST describe, in plain language, how the active pull request is selected when `--pr-number` is omitted — including the inputs the CLI reads (current branch, current `origin` URL), the match criterion, and the precedence rule when `--pr-number` is supplied.
- **FR-006**: When auto-detection finds zero matching pull requests, the error message MUST name the branch that was searched and refer to the documented auto-detection rule. When auto-detection finds more than one matching pull request, the CLI MUST write a single line to **stderr** that names the searched branch and lists every candidate PR number, instruct the user to disambiguate with `--pr-number`, and exit with a **non-zero** status. The CLI MUST NOT prompt the user interactively under any condition (regardless of whether stdin/stdout is a TTY) and MUST NOT silently pick one.
- **FR-007**: All existing `azdo pr` behaviour for remotes WITHOUT userinfo MUST remain byte-identical (same stdout, same stderr, same exit code, same API requests) after the fix ships.

### Key Entities

- **Azure DevOps remote URL** — the value returned by `git remote get-url origin`. Carries the organisation, project, repository identifiers, and optionally a userinfo prefix the CLI must tolerate but never echo.
- **Auto-detected pull request** — the unique open pull request whose source branch equals the current local branch, in the repository identified by the auto-detected remote.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user with a remote URL of the form `https://<anything>@dev.azure.com/<org>/<project>/_git/<repo>` can run `azdo pr status`, `azdo pr comments`, `azdo pr comment-resolve` and `azdo pr comment-reopen` end-to-end without manually editing `.git/config` or passing `--org`/`--project`/`--repo` flags. 100% of `azdo pr` subcommands that today auto-detect context succeed on this URL form when they succeed on the equivalent URL without userinfo.
- **SC-002**: Reading `azdo pr <sub> --help` (for every subcommand that accepts `--pr-number`) is sufficient for a new user to predict, in a single sentence, which pull request the command will act on when they do not supply `--pr-number` — verified by asking three users unfamiliar with the codebase to describe the rule after reading the help text and reaching the same answer.
- **SC-003**: No existing parser test regresses; the new parser test suite for userinfo-bearing URLs covers at least: HTTPS current host, HTTPS legacy host with and without `DefaultCollection`, each form with and without trailing `.git`, and one negative case (`https://user@github.com/...` MUST still be rejected).
- **SC-004**: When `azdo pr status` is run on a branch with zero or multiple matching open pull requests, the resulting error message contains the searched branch name and a one-sentence pointer to the auto-detection rule — measured by inspecting the rendered error string in unit tests for both edge cases.

## Assumptions

- The user's reported environment (`origin` = `https://prxm@dev.azure.com/prxm/Jarvis/_git/jarvis-claude-plugin`) is the canonical reproduction case; no schema or registry changes are required beyond the URL recognition layer.
- The auto-detection rule today is "the unique open pull request whose `sourceRefName` equals `refs/heads/<current branch>` in the auto-detected repository". This release documents that rule; it does NOT change it.
- Userinfo in remote URLs is a presentation detail; the CLI does not need to remember or surface the user component anywhere beyond parsing.
