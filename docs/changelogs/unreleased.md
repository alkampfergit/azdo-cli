# Unreleased — targeting 0.15.0

> Working detail for the next release. The `changelog` skill renames this file
> to `docs/changelogs/0.15.0.md` when the release is cut. Only keep categories
> that have entries.

### Added

- **`azdo pr comments add`** (alias `azdo pr comment-add`) — post a **new** comment thread on the pull request overview, which `reply` could not do (it only appends to an existing thread). Body from the inline argument or `--file <path>`; optional `--status active|fixed|wontFix|closed|byDesign|pending` makes the thread resolvable, omitting it posts a plain overview comment; `--dry-run` resolves the target and prints exactly what would be sent without writing anything; `--json` returns `{ pullRequestId, threadId, commentId, status, content, dryRun }` (`033-pr-comment-authoring`).
- **`azdo pr comments edit <threadId>`** (alias `azdo pr comment-edit`) — rewrite an existing comment **in place**, keeping the thread, its id, and its position in the discussion. Edits the thread's first comment by default, `--comment-id <N>` targets another; same `--file` / `--dry-run` support; `--json` also reports `previousContent`. Azure DevOps only allows a comment's own author to edit it, and that rejection is surfaced as a permission error (`033-pr-comment-authoring`).
- **`azdo pr list`** — list a repository's pull requests in a single API call: `--branch <name>` (with or without a `refs/heads/` prefix), `--status active|completed|abandoned|all` (default `active`), `--top <N>` (default 25). Answers "which PR belongs to this branch?" without the checks, policy evaluations, and build lookups `pr status` performs per PR (`033-pr-comment-authoring`).
- **`azdo pr comments --exclude-system` and `--max-chars <N>`** — drop Azure DevOps system comments (branch updates, reviewer votes, build events) and truncate long bodies to N characters plus ` […]`; `0` (the default) means no limit. Both opt-in, both honoured in `--json` (`033-pr-comment-authoring`).
- **`--repo <name>` on every `pr` subcommand** — override the repository derived from the git `origin` remote, so the `pr` group works from outside a checkout of the target repository (`033-pr-comment-authoring`).
- **`--file <path>` on `azdo pr comments reply`** — read the reply body from a UTF-8 file instead of the inline argument, matching `add` and `edit` (`033-pr-comment-authoring`).
- **PR `description` and comment `commentType` in `--json`** — additive fields on the mapped pull request and comment objects, exposed by `pr list`, `pr comments`, and `pr status` (`033-pr-comment-authoring`).

### Removed

- **`scripts/add_pr_comment.ps1`, `scripts/update_pr_comment.ps1`, `scripts/get_pr_comments.ps1`, `scripts/find_pr_for_branch.ps1`** — the four PowerShell helpers hardcoded one organisation/project/repository and a separate `AZDO_WI_PAT`. Every capability they provided is now an `azdo pr` subcommand that uses the CLI's own context and credential resolution (`033-pr-comment-authoring`).
