# Pull requests

`pr` commands work on Azure Repos git repositories. Inside a clone they take the
repository from the `origin` remote and the PR from the current branch; from
anywhere else pass `--org`, `--project` and `--repo`. Pass `--pr-number <N>` to
target one PR instead of guessing from the branch: with no or several open PRs
on the branch, the command fails with exit 1.

## Find a pull request

```bash
azdo pr list --json                              # active PRs in the repository
azdo pr list --branch feature/x --json           # the PR for one source branch
azdo pr list --status abandoned --top 50 --json  # active|completed|abandoned|all
azdo pr list --work-items --json                 # plus linked work item ids
azdo pr status --pr-number 96 --json             # one PR with its checks (status + branch policies)
azdo pr status --branch feature/x --json
```

- `pr list` and branch-based `pr status` **cut `description` at 400
  characters**. For the full text use `azdo pr comments --pr-number <N> --json`
  and read `pullRequest.description`.
- `pr status --json` gives each PR a `checks` array and
  `codeCommentCounts: { open, closed }`.

## Open a pull request

```bash
azdo pr open --title "Add export" --description-file body.md --json
cat body.md | azdo pr open --title "Add export" --description-file - --json
azdo pr open --title "Fix" --source feature/x --target master --draft --work-item 123 --label automata --json
```

- The target defaults to **`develop`**; pass `--target` for anything else. The
  source defaults to the current branch and must already be pushed.
- Without a description the repository's pull request template is used; with
  both, your text comes first and the template is appended.
- The composed description must fit in **4000 characters**, or the command
  fails (exit 1) before creating anything and says how much to cut.
- If an active PR already exists for the same source and target, it is
  returned unchanged with `created: false`; draft, labels and work items are
  not applied to it.

## Update, abandon, reactivate

```bash
azdo pr update --pr-number 96 --title "Real title" --json
azdo pr update --pr-number 96 --description-file body.md --json   # replaces the description as-is
azdo pr abandon --pr-number 97 --json           # alias: pr close; reversible, not a merge
azdo pr reactivate --pr-number 97 --json
```

- `pr update` sends only the fields you pass; it never adds the template.
  Start a description edit from the full text (`pr comments --json`), never
  from `pr list`.
- These commands are idempotent: no change means `noop: true` and exit 0.
- The CLI cannot complete or merge a pull request. A completed PR cannot be
  abandoned.

## Read review threads

```bash
azdo pr comments --pr-number 64 --json
azdo pr comments --pr-number 64 --hide-resolved --exclude-system --max-chars 500 --json
azdo pr comments --pr-number 64 --code-related-only --json   # threads on a file and line
azdo pr comments --pr-number 64 --thread 148 --json          # one thread; exit 1 if absent
azdo pr comments --pr-number 64 --contains '"kind":"plan"' --json   # literal, case-sensitive
```

Each thread has `id`, `status`, `threadContext` (file path or `null`), `line`
and `comments` with `id`, `authorId`, `authorUniqueName`, `content`,
`commentType` (`text` or `system`).

## Write review threads

```bash
azdo pr comments add --pr-number 64 --file finding.md --dry-run   # preview, writes nothing
azdo pr comments add --pr-number 64 --file finding.md --json      # new overview thread
azdo pr comments add --pr-number 64 --file finding.md --status active --json   # resolvable thread
azdo pr comments add --pr-number 64 --file finding.md --file-path src/Foo.cs --line 42 --end-line 45 --json
azdo pr comments reply 148 --pr-number 64 --file answer.md --json
azdo pr comments edit 148 --pr-number 64 --file plan.md --json    # rewrite the first comment in place
azdo pr comments delete 148 --pr-number 64 --comment-id 3 --dry-run
azdo pr comment-resolve 148 --pr-number 64 --json
azdo pr comment-reopen 148 --pr-number 64 --json
```

- `--file -` reads the body from stdin.
- `--file-path` is relative to the repository root; `--side left` comments on
  the old version (deleted lines). A file the PR does not change fails with
  exit 3 unless you pass `--allow-unchanged-file`.
- Prefer `edit` over a second comment when you correct your own text. Only the
  author may edit or delete a comment (otherwise exit 4).
- `delete` has no prompt and cannot be undone; run it with `--dry-run` first.
  `--comment-id` is required when the thread has more than one comment.

## Reviewers and linked work items

```bash
azdo pr reviewers list --pr-number 64 --json     # votes as voteState: approved, waiting-for-author, rejected, ...
azdo pr reviewers add jane@example.com --pr-number 64 --required --json
azdo pr reviewers remove jane@example.com --pr-number 64 --json
azdo pr work-items link 1234 --pr-number 64 --json
azdo pr work-items unlink 1234 --pr-number 64 --json
```

- `reviewers add` / `remove` resolve the email through the Identities API,
  which needs the **Identity (Read)** scope (exit 4 without it).
- Link work items with `pr work-items`, not with `azdo relations`.

## Pull request pipelines

`azdo pipeline get-runs --pr 64 --json` lists the PR's validation runs; see
`references/pipelines.md`.
