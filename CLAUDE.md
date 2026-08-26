# azdo-cli Development Guidelines

Check [AGENTS.md](/workspaces/azdo-cli/AGENTS.md) for the real repository guidance and project memory.

Skills live in `.agents/skills`.

## Recent Changes
- 035-fix-workitem-artifact-uri: `azdo pr work-items link` was writing an ArtifactLink URI with literal `/` separators (`vstfs:///Git/PullRequestId/<projectId>/<repositoryId>/<prId>`) instead of the `%2F`-joined form Azure DevOps' UI actually renders; fixed `buildWorkItemArtifactUri` in `src/services/pr-client.ts` to percent-encode segments and join with `%2F`. No dependency or command-surface changes.
- 033-pr-comment-authoring (consumer-feedback round): fixed option plumbing on the nested `pr comments add|edit|reply` (commander stores an option on the command that declares it, so the duplicated `--org/--project/--repo/--pr-number/--json` were lost — `--pr-number` silently fell back to the branch's PR); PR `url` is now built instead of always `null`; added `createdByUniqueName`/`createdById`, `--thread`, `--contains`, per-comment `truncated`/`originalLength`, the token source in auth failures, and the credential precedence in `azdo config --help`. New `tests/unit/pr-command-tree.test.ts` drives commands through the real `azdo pr` tree — the isolated-factory suites cannot see option-plumbing bugs.
- 033-pr-comment-authoring: New `azdo pr comments add` / `edit` (create a thread, rewrite a comment in place; `--file`, `--dry-run`, top-level `comment-add` / `comment-edit` aliases), new `azdo pr list` (single-call PR lookup with `--branch` / `--status` / `--top`), `--exclude-system` + `--max-chars` on `pr comments`, `--file` on `pr comments reply`, and `--repo` on every `pr` subcommand. The four `scripts/*_pr_*.ps1` helpers were deleted — Azure DevOps capability ships as CLI commands only. No new dependencies.

## Active Technologies
- TypeScript 5.x (strict), commander.js, native `fetch` — unchanged; no new runtime dependencies from recent features.
